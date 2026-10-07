export function closestElement<T extends keyof HTMLElementTagNameMap>(
    root: HTMLElement,
    tag: T,
    range?: Range | null,
): HTMLElementTagNameMap[T] | null {
    const current = range?.startContainer ?? window.getSelection()?.anchorNode;
    const element = current instanceof Element ? current : current?.parentElement;
    const closest = element?.closest(tag) as HTMLElementTagNameMap[T] | null;
    return closest && root.contains(closest) ? closest : null;
}
export function focusableElements(container: HTMLElement): HTMLElement[] {
    return [
        ...container.querySelectorAll<HTMLElement>(
            'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
    ];
}
export function replaceTextInElement(
    element: HTMLElement,
    search: RegExp,
    replacement: string,
    replaceAll: boolean,
): void {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
        const value = node.textContent ?? '';
        const next = value.replace(search, replacement);
        if (next !== value) {
            node.textContent = next;
            if (!replaceAll) return;
        }
        node = walker.nextNode();
    }
}

/**
 * Puts a non-breaking space after an inserted chip unless whitespace already
 * follows it. A plain space collapses at the end of a line, which would glue
 * the next typed word to the chip. Returns a caret range after that space.
 */
export function caretAfterChipSpace(chip: Node): Range {
    let next = chip.nextSibling;
    while (next instanceof Text && next.data === '') next = next.nextSibling;
    const range = document.createRange();
    if (next instanceof Text && /^\s/u.test(next.data)) {
        range.setStart(next, 1);
    } else {
        const space = document.createTextNode(' ');
        chip.parentNode?.insertBefore(space, chip.nextSibling);
        range.setStart(space, 1);
    }
    range.collapse(true);
    return range;
}
