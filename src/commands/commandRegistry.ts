import { executeClipboardCommand } from './clipboardCommands';
import { insertChecklist, isChecklistActive } from './checklistCommands';
import { executeFormatCommand, queryFormatState } from './formatCommands';
import { setListStyle } from './listCommands';
import { insertAtSelection } from '../utils/html';
import { isCaretInRootInline, liftNestedLists, removeInheritedFontStyles } from '../utils/blocks';
import { executeTableCommand } from './tableCommands';
import { printEditorContent } from './printCommands';
import type { NativeEditorCommand } from '../types';

const TABLE_COMMANDS = new Set([
    'deleteTable',
    'cellProperties',
    'mergeCells',
    'splitCell',
    'rowBefore',
    'rowAfter',
    'deleteRow',
    'columnBefore',
    'columnAfter',
    'deleteColumn',
]);
const LIST_COMMANDS = new Set(['bullist', 'numlist', 'checklist']);
const INDENT_COMMANDS = new Set(['indent', 'outdent']);

export function executeEditorCommand(
    root: HTMLElement,
    id: string,
    value: string | undefined,
    executeCommand: NativeEditorCommand,
): boolean {
    if (TABLE_COMMANDS.has(id)) return executeTableCommand(root, id);
    if (LIST_COMMANDS.has(id) || INDENT_COMMANDS.has(id)) {
        const changed = LIST_COMMANDS.has(id)
            ? executeListCommand(root, id, value, executeCommand)
            : executeFormatCommand(root, id, value, executeCommand);
        normalizeListToggle(root, executeCommand);
        removeInheritedFontStyles(root);
        return changed;
    }
    if (id === 'selectall') return selectEditorContent(root);
    if (id === 'hr') return insertAtSelection(root, '<hr><p><br></p>');
    if (id === 'anchor')
        return insertAtSelection(
            root,
            `<a id="${globalThis.crypto?.randomUUID?.() ?? Date.now()}" name="anchor"></a>`,
        );
    if (id === 'print') return printEditorContent(root);
    return executeFormatCommand(root, id, value, executeCommand);
}
function executeListCommand(
    root: HTMLElement,
    id: string,
    value: string | undefined,
    executeCommand: NativeEditorCommand,
): boolean {
    if (id === 'checklist') return insertChecklist(root, executeCommand);
    if (value !== undefined)
        return setListStyle(root, id === 'bullist' ? 'ul' : 'ol', value, executeCommand);
    return executeFormatCommand(root, id, value, executeCommand);
}

/**
 * Chrome nests a new list inside the current paragraph, and turning a list off
 * (or outdenting its last level) leaves the text directly in the editor root.
 */
function normalizeListToggle(root: HTMLElement, executeCommand: NativeEditorCommand): void {
    liftNestedLists(root);
    if (isCaretInRootInline(root)) executeCommand('formatBlock', 'p');
}

/**
 * Selects the editor content through the Selection API, which also works while
 * the editor is readonly and `selectAll` would select the whole page.
 */
function selectEditorContent(root: HTMLElement): boolean {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(root);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

export async function executeAsyncEditorCommand(
    root: HTMLElement,
    id: string,
    executeCommand: NativeEditorCommand,
): Promise<boolean> {
    return ['cut', 'copy', 'paste', 'pasteText'].includes(id)
        ? executeClipboardCommand(
              root,
              id as 'cut' | 'copy' | 'paste' | 'pasteText',
              executeCommand,
          )
        : false;
}
export function isEditorCommandActive(id: string): boolean {
    if (id === 'checklist') return isChecklistActive();
    return queryFormatState(id);
}
export function isTableCommand(id: string): boolean {
    return TABLE_COMMANDS.has(id);
}
