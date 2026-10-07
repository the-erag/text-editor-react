const LIFTABLE_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,pre';
const NESTED_BLOCK_TAGS = new Set([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'DETAILS',
    'DIV',
    'DL',
    'FIELDSET',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HR',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'UL',
]);
const VOID_CONTENT_SELECTOR = 'img,video,audio,iframe,input,a[name],a[id]';
const INHERITED_FONT_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'font-style'];

interface BoundaryPoint {
    node: Node;
    offset: number;
}

interface SelectionSnapshot {
    selection: Selection;
    start: BoundaryPoint;
    end: BoundaryPoint;
}

export function isNestedBlock(node: Node): node is HTMLElement {
    return node instanceof HTMLElement && NESTED_BLOCK_TAGS.has(node.tagName);
}

export function closestLiftableBlock(node: Node, root: HTMLElement): HTMLElement | null {
    const element = node instanceof Element ? node : node.parentElement;
    const block = element?.closest<HTMLElement>(LIFTABLE_SELECTOR);
    return block && block !== root && root.contains(block) ? block : null;
}

/**
 * Splits a paragraph, heading or `pre` around block children the browser
 * nested inside it, so the result stays valid HTML after a reparse.
 */
export function liftNestedBlocks(block: HTMLElement): HTMLElement[] {
    if (!block.matches(LIFTABLE_SELECTOR) || !block.parentNode) return [];
    const children = [...block.childNodes];
    if (!children.some(isNestedBlock)) return [];
    const snapshot = snapshotSelection(block);
    const parts: Node[] = [];
    const lifted: HTMLElement[] = [];
    let run: HTMLElement | null = null;
    for (const child of children) {
        if (isNestedBlock(child)) {
            parts.push(child);
            lifted.push(child);
            run = null;
            continue;
        }
        if (!run) {
            run = block.cloneNode(false) as HTMLElement;
            run.removeAttribute('id');
            parts.push(run);
        }
        run.append(child);
    }
    const kept = parts.filter((part) => lifted.includes(part as HTMLElement) || !isEmptyRun(part));
    const firstRun = kept.find((part) => !lifted.includes(part as HTMLElement));
    if (block.id && firstRun instanceof HTMLElement) firstRun.id = block.id;
    block.replaceWith(...kept);
    if (snapshot) restoreSnapshot(snapshot, block, children);
    return lifted;
}

/**
 * Lifts every list that a browser list command nested inside a paragraph.
 */
export function liftNestedLists(root: HTMLElement): void {
    const blocks = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(
        ':is(p,h1,h2,h3,h4,h5,h6,pre) > ul, :is(p,h1,h2,h3,h4,h5,h6,pre) > ol',
    ).forEach((list) => {
        if (list.parentElement) blocks.add(list.parentElement);
    });
    blocks.forEach((block) => liftNestedBlocks(block));
}

/**
 * Returns whether the caret sits in text or inline content placed directly in
 * the editor root, outside any block.
 */
export function isCaretInRootInline(root: HTMLElement): boolean {
    let node = window.getSelection()?.anchorNode ?? null;
    if (!node || !root.contains(node) || node === root) return false;
    while (node.parentNode && node.parentNode !== root) node = node.parentNode;
    return !isNestedBlock(node) && !(node instanceof HTMLLIElement);
}

/**
 * Returns the caret position at the end of a block's editable content, placed
 * before a trailing `<br>` so typing continues on the same line.
 */
export function blockEndRange(block: Node): Range {
    const range = document.createRange();
    if (isAtomic(block)) {
        range.setStartAfter(block);
        return range;
    }
    let node: Node = block;
    while (node.lastChild) {
        const last: Node = node.lastChild;
        if (last.nodeName === 'BR') {
            range.setStartBefore(last);
            return range;
        }
        if (last instanceof Text) {
            range.setStart(last, last.length);
            return range;
        }
        if (isAtomic(last)) {
            range.setStartAfter(last);
            return range;
        }
        node = last;
    }
    range.setStart(node, node.childNodes.length);
    return range;
}

/**
 * Removes font declarations the browser copied onto spans when it moved
 * paragraphs, as long as dropping them leaves the computed style unchanged.
 */
export function removeInheritedFontStyles(root: HTMLElement): void {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const snapshot = snapshotSelection(root);
    const spans = [...root.querySelectorAll<HTMLSpanElement>('span[style]')].filter(
        (span) => range.intersectsNode(span) && span.contentEditable !== 'false',
    );
    for (const span of spans) {
        removeRedundantFontStyles(span);
        if (span.getAttribute('style')?.trim() === '') span.removeAttribute('style');
        if (span.attributes.length === 0) span.replaceWith(...span.childNodes);
    }
    if (snapshot) restoreSnapshot(snapshot);
}

function removeRedundantFontStyles(span: HTMLSpanElement): void {
    for (const property of INHERITED_FONT_PROPERTIES) {
        const value = span.style.getPropertyValue(property);
        if (!value) continue;
        const priority = span.style.getPropertyPriority(property);
        const before = getComputedStyle(span).getPropertyValue(property);
        span.style.removeProperty(property);
        if (getComputedStyle(span).getPropertyValue(property) !== before)
            span.style.setProperty(property, value, priority);
    }
}

function isAtomic(node: Node): boolean {
    return (
        node instanceof HTMLElement &&
        (node.matches('hr,img,video,audio,iframe,input,br') || node.contentEditable === 'false')
    );
}

function isEmptyRun(node: Node): boolean {
    if (!(node instanceof HTMLElement)) return false;
    return (
        !/[^\t\n\f\r ]/.test(node.textContent ?? '') && !node.querySelector(VOID_CONTENT_SELECTOR)
    );
}

function snapshotSelection(scope: Node): SelectionSnapshot | null {
    const selection = scope.ownerDocument?.defaultView?.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    return {
        selection,
        start: { node: range.startContainer, offset: range.startOffset },
        end: { node: range.endContainer, offset: range.endOffset },
    };
}

function restoreSnapshot(
    snapshot: SelectionSnapshot,
    replaced?: HTMLElement,
    children: Node[] = [],
): void {
    const start = resolvePoint(snapshot.start, replaced, children);
    const end = resolvePoint(snapshot.end, replaced, children);
    if (!start || !end) return;
    try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        snapshot.selection.removeAllRanges();
        snapshot.selection.addRange(range);
    } catch {
        // The saved boundary no longer exists; keep the browser's selection.
    }
}

function resolvePoint(
    point: BoundaryPoint,
    replaced: HTMLElement | undefined,
    children: Node[],
): BoundaryPoint | null {
    if (replaced && point.node === replaced) {
        const following = children.slice(point.offset).find((child) => child.isConnected);
        const preceding = children
            .slice(0, point.offset)
            .reverse()
            .find((child) => child.isConnected);
        const anchor = following ?? preceding;
        const parent = anchor?.parentNode;
        if (!anchor || !parent) return null;
        const index = [...parent.childNodes].indexOf(anchor as ChildNode);
        return { node: parent, offset: following ? index : index + 1 };
    }
    if (!point.node.isConnected) return null;
    const length =
        point.node instanceof CharacterData ? point.node.length : point.node.childNodes.length;
    return { node: point.node, offset: Math.min(point.offset, length) };
}
