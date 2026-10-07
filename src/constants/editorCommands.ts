export const FORMAT_COMMANDS: Record<string, string> = {
    bold: 'bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'strikeThrough',
    superscript: 'superscript',
    subscript: 'subscript',
    alignleft: 'justifyLeft',
    aligncenter: 'justifyCenter',
    alignright: 'justifyRight',
    alignjustify: 'justifyFull',
    bullist: 'insertUnorderedList',
    numlist: 'insertOrderedList',
    outdent: 'outdent',
    indent: 'indent',
    removeformat: 'removeFormat',
    undo: 'undo',
    redo: 'redo',
    selectall: 'selectAll',
};

/** Commands that still work while the editor is readonly or disabled by config. */
export const READ_ONLY_COMMANDS = ['fullscreen', 'print', 'wordCount', 'copy', 'selectall'];
/** Dialogs that only read the content, so they stay available while readonly. */
export const READ_ONLY_DIALOGS = ['preview', 'source', 'shortcuts', 'about'];

export function isReadOnlyAction(item: { command?: string; dialog?: string }): boolean {
    return Boolean(
        (item.command && READ_ONLY_COMMANDS.includes(item.command)) ||
        (item.dialog && READ_ONLY_DIALOGS.includes(item.dialog)),
    );
}
