import { isSafeUrl } from './url';
import { isMentionCandidate, normalizeMentionElement } from './mention';
import { isMergeTagCandidate, normalizeMergeTagElement } from './mergeTag';
export interface SanitizerOptions {
    allowedTags: string[];
    allowedAttributes: Record<string, string[]>;
    allowRelativeUrls: boolean;
}

export function canSanitizeHtml(): boolean {
    return (
        typeof document !== 'undefined' &&
        typeof DOMParser !== 'undefined' &&
        typeof NodeFilter !== 'undefined'
    );
}
const SAFE_STYLES = new Set([
    'color',
    'background-color',
    'font-family',
    'font-size',
    'font-weight',
    'font-style',
    'text-decoration',
    'text-align',
    'line-height',
    'margin-left',
    'margin-right',
    'display',
    'list-style-type',
    'width',
    'height',
    'border',
    'border-width',
    'border-style',
    'border-color',
    'border-collapse',
    'padding',
    'background',
]);

export function sanitizeHtml(html: string, options: SanitizerOptions): string {
    if (!canSanitizeHtml()) return '';
    const documentNode = new DOMParser().parseFromString(html, 'text/html');
    const walker = documentNode.createTreeWalker(documentNode.body, NodeFilter.SHOW_ELEMENT);
    const elements: Element[] = [];
    let node = walker.nextNode();
    while (node) {
        elements.push(node as Element);
        node = walker.nextNode();
    }
    for (const element of elements) sanitizeElement(element, options);
    return documentNode.body.innerHTML;
}
/** Elements removed together with their content instead of being unwrapped into text. */
const REMOVED_WITH_CONTENT = new Set([
    'script',
    'style',
    'noscript',
    'template',
    'object',
    'embed',
]);

function sanitizeElement(original: Element, options: SanitizerOptions): void {
    const element = convertFontElement(original);
    const tag = element.tagName.toLowerCase();
    if (REMOVED_WITH_CONTENT.has(tag)) {
        element.remove();
        return;
    }
    if (!options.allowedTags.includes(tag)) {
        element.replaceWith(...element.childNodes);
        return;
    }
    if (
        tag === 'input' &&
        (element.getAttribute('type') !== 'checkbox' ||
            element.getAttribute('data-erag-checklist-checkbox') !== 'true')
    ) {
        element.remove();
        return;
    }
    if (isMentionCandidate(element)) {
        if (!normalizeMentionElement(element)) {
            element.replaceWith(element.ownerDocument.createTextNode(element.textContent ?? ''));
        }
        return;
    }
    if (isMergeTagCandidate(element)) {
        if (!normalizeMergeTagElement(element)) {
            element.replaceWith(element.ownerDocument.createTextNode(element.textContent ?? ''));
        }
        return;
    }
    if (tag === 'span') element.removeAttribute('contenteditable');
    if (tag === 'input') element.setAttribute('contenteditable', 'false');
    sanitizeAttributes(element, tag, options);
    if (tag === 'img' && !element.getAttribute('src')) {
        element.remove();
        return;
    }
    if (tag === 'iframe') {
        const src = element.getAttribute('src') ?? '';
        if (!/^https:\/\//i.test(src)) element.remove();
        else element.setAttribute('sandbox', 'allow-same-origin allow-presentation');
    }
}

function sanitizeAttributes(element: Element, tag: string, options: SanitizerOptions): void {
    const allowed = new Set([
        ...(options.allowedAttributes['*'] ?? []),
        ...(options.allowedAttributes[tag] ?? []),
    ]);
    for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || !allowed.has(name)) {
            element.removeAttribute(attribute.name);
            continue;
        }
        if (
            ['href', 'src', 'poster'].includes(name) &&
            !isSafeUrl(attribute.value, {
                allowRelative: options.allowRelativeUrls,
                allowDataImage: tag === 'img',
            })
        ) {
            element.removeAttribute(attribute.name);
            continue;
        }
        if (name !== 'style') continue;
        const style = sanitizeStyle(attribute.value);
        if (style) element.setAttribute('style', style);
        else element.removeAttribute('style');
    }
}

/**
 * Legacy content can hold `<font face|color>` from older `execCommand` output.
 * It becomes a styled span so the formatting survives the allowed-tags check.
 */
function convertFontElement(element: Element): Element {
    if (element.tagName.toLowerCase() !== 'font') return element;
    const face = element.getAttribute('face')?.trim();
    const color = element.getAttribute('color')?.trim();
    if (!face && !color) return element;
    const span = element.ownerDocument.createElement('span');
    if (face) span.style.fontFamily = face;
    if (color) span.style.color = color;
    const style = [element.getAttribute('style'), span.getAttribute('style')]
        .filter(Boolean)
        .join(';');
    if (style) span.setAttribute('style', style);
    span.append(...element.childNodes);
    element.replaceWith(span);
    return span;
}
function sanitizeStyle(value: string): string {
    return value
        .split(';')
        .flatMap((rule) => {
            const separator = rule.indexOf(':');
            if (separator < 1) return [];
            const name = rule.slice(0, separator).trim().toLowerCase();
            const raw = rule.slice(separator + 1).trim();
            return SAFE_STYLES.has(name) && raw && !/url\s*\(|expression|javascript:/i.test(raw)
                ? [`${name}:${raw}`]
                : [];
        })
        .join(';');
}
