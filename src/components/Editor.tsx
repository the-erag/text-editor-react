import { forwardRef, useImperativeHandle, useMemo, useRef, type CSSProperties } from 'react';
import { setupEditor } from '../controllers/setupEditor';
import { useCssTransition } from '../hooks/useCssTransition';
import { useLatest, useSetup } from '../hooks/useSetup';
import type { EditorInstance, EditorProps } from '../types';
import { normalizeEditorConfig } from '../utils/config';
import { classNames } from '../utils/events';
import { cssUnit } from '../utils/units';
import { EditorContent } from './EditorContent';
import { EditorDialogs } from './EditorDialogs';
import { EditorMenuBar } from './EditorMenuBar';
import { EditorStatusBar } from './EditorStatusBar';
import { EditorToolbar } from './EditorToolbar';
import { ImageResizeOverlay } from './images/ImageResizeOverlay';
import { InlineImageUploadPortal } from './images/InlineImageUploadPortal';
import { MentionDropdown } from './mentions/MentionDropdown';
import { MentionHoverCard } from './mentions/MentionHoverCard';
import { MergeTagDropdown } from './merge-tags/MergeTagDropdown';
import { MergeTagSidebar } from './merge-tags/MergeTagSidebar';
import { TableContextMenu } from './tables/TableContextMenu';
import { TableInteractionOverlay } from './tables/TableInteractionOverlay';

export const Editor = forwardRef<EditorInstance, EditorProps>(function Editor(props, ref) {
    const { disabled = false, ariaLabel = 'Rich text editor' } = props;
    const config = useMemo(() => normalizeEditorConfig(props.init), [props.init]);
    const propsRef = useLatest(props);
    const configRef = useLatest(config);
    const shell = useRef<HTMLDivElement>(null);
    const contentWrap = useRef<HTMLDivElement>(null);
    const ctx = useSetup((scope) =>
        setupEditor(scope, { props: propsRef, config: configRef, shell, contentWrap }),
    );
    const { editor, selection, mentions, mergeTags, mergeTagSidebar, imageResize } = ctx;
    const { tableInteractions, inlineImageUpload, editorResize } = ctx;
    const dialog = ctx.dialog.value;
    const locked = ctx.locked.value;
    const { menubar, toolbar, statusbar } = config;
    const sidebarTransition = useCssTransition<HTMLElement>(
        mergeTagSidebar.isOpen.value,
        'erag-merge-tag-sidebar',
    );
    const shellStyle = {
        width: cssUnit(config.width),
        minHeight: cssUnit(config.minHeight),
        maxHeight: cssUnit(config.maxHeight),
        '--erag-editor-height': cssUnit(editorResize.currentHeight.value ?? config.height),
    } as CSSProperties;

    useImperativeHandle(ref, () => ctx.editorInstance, [ctx]);

    return (
        <>
            <div
                ref={shell}
                className={classNames(
                    'erag-editor',
                    disabled && 'erag-is-disabled',
                    locked && !disabled && 'erag-is-readonly',
                    !menubar && Boolean(toolbar) && 'erag-editor--toolbar-first',
                    props.className,
                )}
                style={shellStyle}
            >
                {props.name && (
                    <input
                        type="hidden"
                        name={props.name}
                        value={editor.html.value}
                    />
                )}
                {menubar && (
                    <EditorMenuBar
                        menus={menubar === true ? true : menubar}
                        plugins={config.plugins}
                        disabled={disabled}
                        locked={locked}
                        activeCommands={ctx.activeCommands.value}
                        availableCommands={ctx.availableCommands.value}
                        insideTable={selection.state.value.insideTable}
                        lineHeightFormats={config.lineHeightFormats}
                        dateFormats={config.dateFormats}
                        timeFormats={config.timeFormats}
                        mergeTags={config.mergeTags}
                        templates={config.templates}
                        mergeTagSidebarOpen={mergeTagSidebar.isOpen.value}
                        templateDialogOpen={dialog === 'templates'}
                        end={props.menubarEnd}
                        onOpening={mergeTagSidebar.handleMenubarOpening}
                        onMergeTagToggle={mergeTagSidebar.toggle}
                        onTemplatesOpen={() => ctx.openDialog('templates')}
                        onSelect={ctx.handleMenu}
                    />
                )}
                {toolbar && (
                    <EditorToolbar
                        toolbar={toolbar}
                        config={config}
                        disabled={disabled}
                        locked={locked}
                        activeCommands={ctx.activeCommands.value}
                        availableCommands={ctx.availableCommands.value}
                        insideTable={selection.state.value.insideTable}
                        start={props.toolbarStart}
                        end={props.toolbarEnd}
                        onCommand={ctx.restoreAndRun}
                        onDialog={ctx.openDialog}
                    />
                )}
                <div
                    ref={contentWrap}
                    className="erag-editor__content-wrap"
                >
                    <EditorContent
                        id={props.id}
                        html={editor.html.value}
                        disabled={disabled}
                        readonly={locked}
                        placeholder={config.placeholder}
                        spellcheck={config.spellcheck}
                        direction={config.direction}
                        contentClass={config.contentClass}
                        contentStyle={config.contentStyle}
                        label={ariaLabel}
                        onReady={ctx.ready}
                        onClick={ctx.handleEditorClick}
                        onFocus={ctx.handleFocus}
                        onBlur={ctx.handleBlur}
                        onInput={ctx.handleInput}
                        onKeyDown={ctx.handleKeydown}
                        onPaste={(event) => void ctx.handlePaste(event)}
                        onSelectionChange={ctx.selectionChanged}
                    />
                    {imageResize.box.value && (
                        <ImageResizeOverlay
                            box={imageResize.box.value}
                            deleting={imageResize.deleting.value}
                            deleteError={imageResize.deleteError.value}
                            deleteFromServer={Boolean(config.imagesDeleteHandler)}
                            onResizeStart={imageResize.resizeStart}
                            onDelete={ctx.deleteSelectedImage}
                        />
                    )}
                    {tableInteractions.tableBox.value && (
                        <TableInteractionOverlay
                            tableBox={tableInteractions.tableBox.value}
                            cellBoxes={tableInteractions.cellBoxes.value}
                            onResizeStart={tableInteractions.resizeStart}
                        />
                    )}
                    {editor.empty.value &&
                        !inlineImageUpload.isOpen.value &&
                        props.emptyState != null && (
                            <div className="erag-editor__empty">{props.emptyState}</div>
                        )}
                    {sidebarTransition.mounted && (
                        <MergeTagSidebar
                            id={mergeTagSidebar.id}
                            elementRef={sidebarTransition.ref}
                            className={sidebarTransition.className}
                            items={config.mergeTags.items}
                            disabled={locked}
                            onClose={mergeTagSidebar.close}
                            onSelect={mergeTagSidebar.select}
                        />
                    )}
                </div>
                {tableInteractions.contextMenu.value && (
                    <TableContextMenu
                        position={tableInteractions.contextMenu.value}
                        multipleCells={tableInteractions.hasMultipleCells.value}
                        onSelect={ctx.handleTableContextAction}
                    />
                )}
                <InlineImageUploadPortal
                    target={inlineImageUpload.target.value}
                    config={config}
                    state={inlineImageUpload.state}
                    error={inlineImageUpload.message.value}
                    onFile={(file) => void inlineImageUpload.uploadFile(file)}
                    onInsertUrl={(url) => void inlineImageUpload.insertUrl(url)}
                    onClose={() => void inlineImageUpload.close()}
                />
                {statusbar && (
                    <EditorStatusBar
                        path={selection.state.value.path}
                        counts={editor.counts.value}
                        resize={config.resize}
                        helpText={config.helpShortcutText}
                        disabled={disabled}
                        start={props.statusbarStart}
                        end={props.statusbarEnd}
                        onResizeStart={editorResize.start}
                    />
                )}
                {mentions.isOpen.value && (
                    <MentionDropdown
                        items={mentions.items.value}
                        activeIndex={mentions.activeIndex.value}
                        state={mentions.state.value}
                        query={mentions.query.value}
                        positionStyle={mentions.positionStyle.value}
                        renderItem={props.renderMentionItem}
                        renderLoading={props.renderMentionLoading}
                        renderEmpty={props.renderMentionEmpty}
                        renderError={props.renderMentionError}
                        onActivate={mentions.setActiveIndex}
                        onSelect={mentions.select}
                        onRetry={mentions.retry}
                        onReady={mentions.setDropdownElement}
                    />
                )}
                {mergeTags.isOpen.value && (
                    <MergeTagDropdown
                        items={mergeTags.items.value}
                        activeIndex={mergeTags.activeIndex.value}
                        query={mergeTags.query.value}
                        positionStyle={mergeTags.positionStyle.value}
                        onActivate={mergeTags.setActiveIndex}
                        onSelect={mergeTags.select}
                        onReady={mergeTags.setDropdownElement}
                    />
                )}
                {mentions.hoverItem.value && (
                    <MentionHoverCard
                        item={mentions.hoverItem.value}
                        positionStyle={mentions.hoverPositionStyle.value}
                        onReady={mentions.setHoverCardElement}
                    />
                )}
            </div>
            <EditorDialogs
                dialog={dialog}
                dialogMode={ctx.dialogMode.value}
                config={config}
                {...ctx.dialogData()}
                html={editor.html.value}
                sourceCodeEditable={ctx.sourceCodeEditable.value}
                root={editor.root.value}
                onClose={ctx.closeDialog}
                onSaveLink={ctx.saveLink}
                onUnlink={ctx.unlink}
                onSaveMedia={ctx.saveMedia}
                onSaveTable={ctx.saveTable}
                onSelectCharacter={ctx.insertCharacter}
                onSaveSource={ctx.saveSource}
                onChanged={ctx.syncInput}
                onSaveTableProperties={ctx.saveTableProperties}
                onSaveCellProperties={ctx.saveCellProperties}
                onSelectColor={ctx.applyDialogColor}
                onInsertTemplate={ctx.insertTemplate}
            />
        </>
    );
});
