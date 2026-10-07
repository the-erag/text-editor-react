import type { TextCountStatistics } from '../types';
import { blockEndRange, closestLiftableBlock, isNestedBlock, liftNestedBlocks } from './blocks';

const TRANSIENT_CONTENT_SELECTOR = '[data-erag-transient="true"]';

export function getPersistentHtml(root: HTMLElement): string {
    if (!root.querySelector(TRANSIENT_CONTENT_SELECTOR)) return root.innerHTML;
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(TRANSIENT_CONTENT_SELECTOR).forEach((element) => element.remove());
    return clone.innerHTML;
}

export function getPersistentText(root: HTMLElement): string {
    if (!root.querySelector(TRANSIENT_CONTENT_SELECTOR)) return root.textContent ?? '';
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(TRANSIENT_CONTENT_SELECTOR).forEach((element) => element.remove());
    return clone.textContent ?? '';
}

export function getTextCounts(root: HTMLElement): { words: number; characters: number } {
    const text = getPersistentText(root)
        .replace(/\u00a0/g, ' ')
        .trim();
    // innerText keeps the line breaks between blocks, so `<p>one</p><p>two</p>` is two words.
    const words = root.innerText.replace(/\u00a0/g, ' ').trim();
    return { words: words ? words.split(/\s+/u).length : 0, characters: text.length };
}
export function getDetailedTextCounts(value: string): TextCountStatistics {
    const text = value.replace(/\u00a0/g, ' ');
    const trimmed = text.trim();
    return {
        words: trimmed ? trimmed.split(/\s+/u).length : 0,
        charactersWithoutSpaces: text.replace(/\s/gu, '').length,
        characters: text.length,
    };
}
export function escapeHtml(value: string): string {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
}
export function insertAtSelection(root: HTMLElement, html: string): boolean {
    const selection = root.ownerDocument.defaultView?.getSelection();
    if (!selection) return false;
    const selectedRange = selection.rangeCount ? selection.getRangeAt(0) : null;
    const range =
        selectedRange && root.contains(selectedRange.commonAncestorContainer)
            ? selectedRange
            : createRangeAtEnd(root);

    root.focus({ preventScroll: true });
    range.deleteContents();
    const fragment = range.createContextualFragment(html);
    const paragraph = [...fragment.childNodes].some(isNestedBlock)
        ? closestLiftableBlock(range.startContainer, root)
        : null;
    if (paragraph) {
        insertBlocksIntoParagraph(paragraph, range, fragment, selection);
        return true;
    }
    const last = fragment.lastChild;
    range.insertNode(fragment);
    if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }
    return true;
}

/**
 * Inserting block HTML at a caret inside a paragraph would nest the blocks in
 * it. The paragraph is split at the caret instead, so the blocks land between
 * its two halves.
 */
function insertBlocksIntoParagraph(
    paragraph: HTMLElement,
    range: Range,
    fragment: DocumentFragment,
    selection: Selection,
): void {
    const tail = paragraph.ownerDocument.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(paragraph, paragraph.childNodes.length);
    const tailContents = tail.extractContents();
    const last = fragment.lastChild;
    paragraph.append(fragment, tailContents);
    liftNestedBlocks(paragraph);
    if (!last?.isConnected) return;
    const caret = isNestedBlock(last) ? blockEndRange(last) : paragraph.ownerDocument.createRange();
    if (!isNestedBlock(last)) caret.setStartAfter(last);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
}

function createRangeAtEnd(root: HTMLElement): Range {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    return range;
}
