import type { RefObject } from 'react';
import { executeAsyncEditorCommand, executeEditorCommand } from '../commands/commandRegistry';
import { handleChecklistKeydown, syncChecklistCheckbox } from '../commands/checklistCommands';
import {
    applyCellProperties,
    DEFAULT_TABLE_PROPERTIES,
    applyTableProperties,
    getCellProperties,
    getTableProperties,
    navigateTableCell,
} from '../commands/tableCommands';
import { insertLink, insertMedia, insertTable } from '../commands/insertCommands';
import { READ_ONLY_COMMANDS, READ_ONLY_DIALOGS } from '../constants/editorCommands';
import { KEYBOARD_SHORTCUTS } from '../constants/keyboardShortcuts';
import { computed, type SetupScope } from '../hooks/useSetup';
import type {
    CellPropertiesValue,
    EditorDialogName,
    EditorProps,
    EditorTemplateItem,
    LinkValue,
    MediaValue,
    MenuItemDefinition,
    ReadonlyRef,
    ResolvedEditorInit,
    WordCountData,
} from '../types';
import { formatDateTime, mergeDateTimeFormats } from '../utils/dateTime';
import { insertAtSelection } from '../utils/html';
import { structuralSignature } from '../utils/signature';
import { createEditor } from './createEditor';
import { createEditorHistory } from './createEditorHistory';
import { createEditorInstance } from './createEditorInstance';
import { createEditorPaste } from './createEditorPaste';
import { createEditorResize } from './createEditorResize';
import { createEditorSelection } from './createEditorSelection';
import { createFullscreen } from './createFullscreen';
import { createImageResize } from './createImageResize';
import { createInlineImageUpload } from './createInlineImageUpload';
import { createLinkInitial } from './linkInitial';
import { createMentions } from './createMentions';
import { createMergeTags } from './createMergeTags';
import { createMergeTagSidebar } from './createMergeTagSidebar';
import { createTableInteractions } from './createTableInteractions';
import { executeNativeCommand } from './nativeEditorCommand';
import { getWordCountData } from './wordCount';

export type TableContextAction =
    | 'cell-properties'
    | 'table-properties'
    | 'rowBefore'
    | 'rowAfter'
    | 'deleteRow'
    | 'columnBefore'
    | 'columnAfter'
    | 'deleteColumn'
    | 'mergeCells'
    | 'splitCell'
    | 'deleteTable';

const EMPTY_LINK: LinkValue = { url: '', text: '', title: '', target: '_self' };
const EMPTY_COUNTS: WordCountData = {
    document: { words: 0, charactersWithoutSpaces: 0, characters: 0 },
    selection: { words: 0, charactersWithoutSpaces: 0, characters: 0 },
};
const EMPTY_CELL_PROPERTIES: CellPropertiesValue = {
    target: 'cell',
    cellType: 'td',
    scope: '',
    horizontalAlign: '',
    verticalAlign: '',
};

const DIALOG_SHORTCUTS = new Set(['link', 'preview', 'find-replace']);

interface EditorSetupSources {
    props: ReadonlyRef<EditorProps>;
    config: ReadonlyRef<ResolvedEditorInit>;
    shell: RefObject<HTMLDivElement | null>;
    contentWrap: RefObject<HTMLDivElement | null>;
}

export function setupEditor(scope: SetupScope, sources: EditorSetupSources) {
    const { props, config } = sources;
    const initialValue = props.value.value ?? props.value.defaultValue ?? '';
    const editor = createEditor(scope, config, initialValue);
    const history = createEditorHistory(scope, editor.root);
    const selection = createEditorSelection(scope, editor.root);
    const contentWrap = computed(() => sources.contentWrap.current);
    const dialog = scope.ref<EditorDialogName | null>(null);
    const dialogMode = scope.ref<'forecolor' | 'backcolor' | null>(null);
    let lastCommitted = initialValue;
    let lastPublished = initialValue;
    const { toggle: toggleFullscreen } = createFullscreen(scope, sources.shell);
    const locked = computed(
        () =>
            Boolean(props.value.disabled) || Boolean(props.value.readOnly) || config.value.readonly,
    );
    const sourceCodeEditable = computed(() => config.value.sourceCodeEditable && !locked.value);
    const inlineImageUpload = createInlineImageUpload(scope, editor.root, config, locked, () =>
        syncInput(),
    );
    const editorResize = createEditorResize(scope, sources.shell, config, locked, (height) =>
        props.value.onResize?.({ height }),
    );
    const imageResizeLocked = computed(() => locked.value || !config.value.imageResize);
    const imageResize = createImageResize(
        scope,
        editor.root,
        contentWrap,
        imageResizeLocked,
        () => syncInput(),
        (image) => props.value.onImageRemove?.(image),
    );
    const tableInteractions = createTableInteractions(scope, editor.root, contentWrap, locked, () =>
        syncInput(),
    );
    const mentionConfig = computed(() => config.value.mentions);
    const mergeTagConfig = computed(() => config.value.mergeTags);
    const mentions = createMentions(
        scope,
        { root: editor.root, config: mentionConfig, locked, executeCommand: executeNativeCommand },
        {
            search: (event) => props.value.onMentionSearch?.(event),
            select: (event) => props.value.onMentionSelect?.(event),
            remove: (event) => props.value.onMentionRemove?.(event),
            change: () => syncInput(),
        },
    );
    const mergeTags = createMergeTags(
        scope,
        { root: editor.root, config: mergeTagConfig, locked, executeCommand: executeNativeCommand },
        {
            select: (event) => props.value.onMergeTagSelect?.(event),
            remove: (event) => props.value.onMergeTagRemove?.(event),
            change: () => syncInput(),
        },
    );
    const mergeTagSidebar = createMergeTagSidebar(
        scope,
        {
            config: mergeTagConfig,
            disabled: computed(() => Boolean(props.value.disabled)),
            locked,
        },
        {
            restoreSelection: selection.restore,
            saveSelection: selection.save,
            insert: mergeTags.insert,
        },
    );
    const { handlePaste } = createEditorPaste(scope, {
        editor,
        selection,
        config,
        locked,
        emitPaste: (event) => props.value.onPaste?.(event),
        onChange: () => {
            syncInput();
            mentions.handleInput();
            mergeTags.handleInput();
        },
    });
    const availableCommands = computed<Record<string, boolean>>(() => ({
        undo: history.canUndo.value,
        redo: history.canRedo.value,
    }));
    const activeCommands = computed<Record<string, boolean>>(() => ({
        ...selection.state.value.commands,
        ...(imageResize.box.value ? imageResize.activeCommands.value : {}),
    }));
    const { getInitial: getLinkInitial, getSelectedAnchor } = createLinkInitial(
        editor.root,
        selection.savedRange,
    );

    scope.watch(
        () => props.value.value,
        (value) => {
            if (value === undefined) return;
            lastPublished = value;
            if (value !== editor.sync()) {
                inlineImageUpload.discard();
                editor.setHtml(value, true);
                history.reset();
            }
        },
    );
    scope.watch(
        () => structuralSignature(config.value),
        () => {
            if (editor.root.value) {
                editor.root.value.setAttribute('dir', config.value.direction);
                editor.updateCounts();
            }
            editorResize.reset();
        },
    );

    function ready(root: HTMLElement): void {
        editor.connect(root);
        selection.update();
        history.update();
        props.value.onReady?.(root);
        if (config.value.autofocus && !locked.value) void scope.nextTick().then(() => root.focus());
    }
    function syncInput(event?: InputEvent): void {
        const value = editor.sync();
        if (value !== lastPublished) {
            lastPublished = value;
            props.value.onChange?.(value);
        }
        if (event) props.value.onInput?.(event);
        selection.update();
        history.update();
        imageResize.refresh();
    }
    function handleInput(event: InputEvent): void {
        syncInput(event);
        mentions.handleInput();
        mergeTags.handleInput();
    }
    function restoreAndRun(id: string, value?: string): void {
        if (!editor.root.value || (locked.value && !READ_ONLY_COMMANDS.includes(id))) return;
        if (id === 'saveSelection') {
            selection.save();
            return;
        }
        if (id === 'backcolor' && tableInteractions.applyCellBackground(value ?? 'transparent'))
            return;
        if (imageResize.executeCommand(id)) return;
        selection.restore();
        if (id === 'imageUpload') {
            void inlineImageUpload.open();
            return;
        }
        if (inlineImageUpload.isOpen.value) {
            void inlineImageUpload.close().then(() => restoreAndRun(id, value));
            return;
        }
        if (id === 'insertMergeTag') {
            const item = config.value.mergeTags.items.find((entry) => entry.value === value);
            if (item) mergeTags.insert(item);
            return;
        }
        if (id === 'fullscreen') {
            void toggleFullscreen();
            return;
        }
        if (id === 'new') {
            editorInstance.setHtml('');
            history.reset();
            return;
        }
        if (id === 'dateTime') {
            const formats = mergeDateTimeFormats(
                config.value.dateFormats,
                config.value.timeFormats,
            );
            const format = formats[Number.parseInt(value ?? '0', 10)];
            if (format) editorInstance.insertText(formatDateTime(format, new Date()));
            return;
        }
        if (id === 'wordCount') {
            dialog.value = 'word-count';
            return;
        }
        if (['cut', 'copy', 'paste', 'pasteText'].includes(id)) {
            void executeAsyncEditorCommand(editor.root.value, id, executeNativeCommand).then(() =>
                syncInput(),
            );
            return;
        }
        if (executeEditorCommand(editor.root.value, id, value, executeNativeCommand)) syncInput();
    }
    function openDialog(name: string): void {
        if (locked.value && !READ_ONLY_DIALOGS.includes(name)) return;
        if (inlineImageUpload.isOpen.value) {
            void inlineImageUpload.close().then(() => openDialog(name));
            return;
        }
        selection.save();
        if (name === 'forecolor' || name === 'backcolor') {
            dialogMode.value = name;
            return;
        }
        dialog.value = name as EditorDialogName;
    }
    function handleMenu(item: MenuItemDefinition): void {
        if (item.dialog) openDialog(item.dialog);
        else if (item.command) restoreAndRun(item.command, item.value);
    }
    function closeDialog(): void {
        dialog.value = null;
        dialogMode.value = null;
        void scope.nextTick().then(() => selection.restore());
    }
    function saveLink(value: LinkValue): void {
        if (!editor.root.value) return;
        selection.restore();
        const anchor = getSelectedAnchor();
        if (anchor) {
            anchor.href = value.url;
            anchor.textContent = value.text || value.url;
            if (value.title) anchor.title = value.title;
            else anchor.removeAttribute('title');
            if (value.target === '_blank') {
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
            } else {
                anchor.removeAttribute('target');
                anchor.removeAttribute('rel');
            }
        } else insertLink(editor.root.value, value, config.value.relativeUrls);
        syncInput();
        closeDialog();
    }
    function unlink(): void {
        selection.restore();
        const anchor = getSelectedAnchor();
        const current = window.getSelection();
        if (anchor && current) {
            // `unlink` does nothing on a collapsed caret, so select the whole link first.
            const range = document.createRange();
            range.selectNodeContents(anchor);
            current.removeAllRanges();
            current.addRange(range);
        }
        executeNativeCommand('unlink');
        syncInput();
        closeDialog();
    }
    function saveMedia(value: MediaValue): void {
        if (editor.root.value) {
            selection.restore();
            insertMedia(editor.root.value, value, config.value.relativeUrls);
            syncInput();
        }
        closeDialog();
    }
    function saveTable(rows: number, columns: number): void {
        if (editor.root.value) {
            selection.restore();
            insertTable(editor.root.value, rows, columns);
            syncInput();
        }
        closeDialog();
    }
    function saveSource(value: string): void {
        if (!sourceCodeEditable.value) {
            closeDialog();
            return;
        }
        editor.setHtml(editor.clean(value), false);
        syncInput();
        closeDialog();
    }
    function saveTableProperties(values: Record<string, string>): void {
        if (editor.root.value) {
            selection.restore();
            const appliedBackgroundToCells = tableInteractions.applyCellBackground(
                values.backgroundColor ?? '',
                false,
            );
            applyTableProperties(
                editor.root.value,
                {
                    ...values,
                    backgroundColor: appliedBackgroundToCells ? '' : (values.backgroundColor ?? ''),
                },
                selection.savedRange.value,
            );
            syncInput();
        }
        closeDialog();
    }
    function saveCellProperties(values: CellPropertiesValue): void {
        if (editor.root.value) {
            applyCellProperties(editor.root.value, selection.savedRange.value, values);
            syncInput();
        }
        closeDialog();
    }
    function insertCharacter(value: string): void {
        editorInstance.insertText(value);
        closeDialog();
    }
    function insertTemplate(item: EditorTemplateItem): void {
        if (!editor.root.value || locked.value) return;
        selection.restore();
        insertAtSelection(editor.root.value, editor.clean(item.content));
        syncInput();
        props.value.onTemplateInsert?.({ item: { ...item } });
        closeDialog();
    }
    function applyDialogColor(color: string): void {
        if (dialogMode.value)
            restoreAndRun(
                dialogMode.value,
                color || (dialogMode.value === 'forecolor' ? '#000000' : 'transparent'),
            );
        closeDialog();
    }
    function commandShortcut(event: KeyboardEvent): boolean {
        const prefix = event.metaKey || event.ctrlKey ? 'mod+' : '';
        const shift = event.shiftKey ? 'shift+' : '';
        const key = `${prefix}${shift}${event.key.toLowerCase()}`;
        const command = KEYBOARD_SHORTCUTS[key];
        if (!command) return false;
        const isDialog = DIALOG_SHORTCUTS.has(command);
        const allowed = isDialog ? READ_ONLY_DIALOGS : READ_ONLY_COMMANDS;
        // Leave blocked shortcuts (like Ctrl+F) to the browser while readonly.
        if (locked.value && !allowed.includes(command)) return false;
        event.preventDefault();
        if (isDialog) openDialog(command);
        else restoreAndRun(command);
        return true;
    }
    function handleKeydown(event: KeyboardEvent): void {
        props.value.onKeyDown?.(event);
        if (locked.value) {
            commandShortcut(event);
            return;
        }
        if (
            mentions.handleKeydown(event) ||
            mergeTags.handleKeydown(event) ||
            mentions.handleRemoval(event) ||
            mergeTags.handleRemoval(event)
        )
            return;
        if (editor.root.value && handleChecklistKeydown(editor.root.value, event)) {
            syncInput();
            return;
        }
        if (commandShortcut(event)) return;
        if (event.altKey && event.key === '0') {
            event.preventDefault();
            openDialog('shortcuts');
        }
        if (
            event.key === 'Tab' &&
            editor.root.value &&
            navigateTableCell(editor.root.value, event.shiftKey)
        )
            event.preventDefault();
    }
    function selectionChanged(): void {
        selection.update();
        mentions.handleSelectionChange();
        mergeTags.handleSelectionChange();
        const current = window.getSelection();
        if (current) props.value.onSelectionChange?.(current);
    }
    function handleFocus(event: FocusEvent): void {
        props.value.onFocus?.(event);
    }
    function handleBlur(event: FocusEvent): void {
        props.value.onBlur?.(event);
        const value = editor.sync();
        if (value !== lastCommitted) {
            lastCommitted = value;
            props.value.onCommit?.(value);
        }
    }
    function handleEditorClick(event: MouseEvent): void {
        if (editor.root.value && syncChecklistCheckbox(editor.root.value, event)) syncInput();
        imageResize.selectFromEvent(event);
        props.value.onClick?.(event);
    }
    function handleTableContextAction(action: TableContextAction): void {
        tableInteractions.restoreSelection();
        selection.save();
        tableInteractions.closeContextMenu();
        if (action === 'cell-properties' || action === 'table-properties') {
            openDialog(action);
            return;
        }
        if (action === 'mergeCells' && tableInteractions.mergeSelectedCells()) return;
        restoreAndRun(action);
        void scope.nextTick().then(() => tableInteractions.refresh());
    }
    /**
     * Values that are expensive to derive (DOM reads, sanitizing) are only
     * computed while the dialog that needs them is open.
     */
    function dialogData() {
        const name = dialog.value;
        return {
            linkInitial: name === 'link' ? getLinkInitial() : EMPTY_LINK,
            previewHtml: name === 'preview' ? editor.clean(editor.html.value) : '',
            wordCountData:
                name === 'word-count'
                    ? getWordCountData(editor.root, selection.savedRange)
                    : EMPTY_COUNTS,
            cellPropertiesInitial:
                name === 'cell-properties'
                    ? getCellProperties(editor.root.value, selection.savedRange.value)
                    : EMPTY_CELL_PROPERTIES,
            tablePropertiesInitial:
                name === 'table-properties'
                    ? getTableProperties(editor.root.value, selection.savedRange.value)
                    : DEFAULT_TABLE_PROPERTIES,
        };
    }
    function deleteSelectedImage(): void {
        void imageResize.deleteSelected(config.value.imagesDeleteHandler);
    }
    const editorInstance = createEditorInstance({
        editor,
        selection,
        inlineImageUpload,
        locked,
        syncInput,
        runCommand: restoreAndRun,
        executeCommand: executeNativeCommand,
        openDialog,
    });
    scope.onMounted(() => document.addEventListener('selectionchange', selectionChanged));
    scope.onBeforeUnmount(() => document.removeEventListener('selectionchange', selectionChanged));

    return {
        editor,
        selection,
        dialog,
        dialogMode,
        locked,
        sourceCodeEditable,
        inlineImageUpload,
        editorResize,
        imageResize,
        tableInteractions,
        mentions,
        mergeTags,
        mergeTagSidebar,
        availableCommands,
        activeCommands,
        dialogData,
        editorInstance,
        ready,
        handleInput,
        handlePaste,
        handleKeydown,
        handleFocus,
        handleBlur,
        handleEditorClick,
        selectionChanged,
        restoreAndRun,
        openDialog,
        handleMenu,
        closeDialog,
        saveLink,
        unlink,
        saveMedia,
        saveTable,
        saveSource,
        saveTableProperties,
        saveCellProperties,
        insertCharacter,
        insertTemplate,
        applyDialogColor,
        handleTableContextAction,
        deleteSelectedImage,
        syncInput: () => syncInput(),
    };
}

export type EditorSetup = ReturnType<typeof setupEditor>;
