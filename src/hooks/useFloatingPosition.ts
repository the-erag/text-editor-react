import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type CSSProperties,
    type RefObject,
} from 'react';

const VIEWPORT_PADDING = 8;
const FLOATING_GAP = 6;
const HIDDEN_STYLE: CSSProperties = { position: 'fixed', left: '-9999px', top: '-9999px' };

export function useFloatingPosition(
    trigger: HTMLElement | null,
    panel: RefObject<HTMLElement | null>,
    boundary: HTMLElement | null,
): CSSProperties {
    const [style, setStyle] = useState<CSSProperties>(HIDDEN_STYLE);
    const frame = useRef(0);
    const activeTrigger = useRef<HTMLElement | null>(null);
    const placeAbove = useRef<boolean | null>(null);
    const latest = useRef({ trigger, boundary });
    latest.current = { trigger, boundary };

    const update = useCallback((): void => {
        const { trigger: anchor, boundary: bounding } = latest.current;
        const floating = panel.current;
        if (!anchor || !floating) return;
        if (activeTrigger.current !== anchor) {
            activeTrigger.current = anchor;
            placeAbove.current = null;
        }
        const a = anchor.getBoundingClientRect();
        const p = floating.getBoundingClientRect();
        const bounds = bounding?.getBoundingClientRect();
        const triggerOutsideBoundary =
            bounds &&
            (a.bottom <= bounds.top ||
                a.top >= bounds.bottom ||
                a.right <= bounds.left ||
                a.left >= bounds.right);
        if (triggerOutsideBoundary) {
            setStyle({ ...HIDDEN_STYLE, visibility: 'hidden', pointerEvents: 'none' });
            return;
        }
        const minLeft = Math.max(
            VIEWPORT_PADDING,
            bounds ? bounds.left + VIEWPORT_PADDING : VIEWPORT_PADDING,
        );
        const maxRight = Math.min(
            window.innerWidth - VIEWPORT_PADDING,
            bounds ? bounds.right - VIEWPORT_PADDING : window.innerWidth - VIEWPORT_PADDING,
        );
        const minTop = Math.max(
            VIEWPORT_PADDING,
            bounds ? bounds.top + VIEWPORT_PADDING : VIEWPORT_PADDING,
        );
        const maxBottom = Math.min(
            window.innerHeight - VIEWPORT_PADDING,
            bounds ? bounds.bottom - VIEWPORT_PADDING : window.innerHeight - VIEWPORT_PADDING,
        );
        const maxLeft = Math.max(minLeft, maxRight - p.width);
        const left = Math.max(minLeft, Math.min(a.left, maxLeft));
        const below = a.bottom + FLOATING_GAP;
        const above = a.top - p.height - FLOATING_GAP;
        if (placeAbove.current === null) {
            const spaceBelow = maxBottom - a.bottom - FLOATING_GAP;
            const spaceAbove = a.top - minTop - FLOATING_GAP;
            placeAbove.current = spaceBelow < p.height && spaceAbove > spaceBelow;
        }
        const preferredTop = placeAbove.current ? above : below;
        const maxTop = Math.max(minTop, maxBottom - p.height);
        const top = Math.max(minTop, Math.min(preferredTop, maxTop));
        setStyle({ position: 'fixed', left: `${left}px`, top: `${top}px` });
    }, [panel]);

    const scheduleUpdate = useCallback((): void => {
        cancelAnimationFrame(frame.current);
        frame.current = requestAnimationFrame(update);
    }, [update]);

    useEffect(() => {
        if (!trigger) {
            activeTrigger.current = null;
            placeAbove.current = null;
        }
        let observer: ResizeObserver | null = null;
        if (trigger && panel.current && typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(scheduleUpdate);
            observer.observe(trigger);
            observer.observe(panel.current);
            if (boundary) observer.observe(boundary);
        }
        scheduleUpdate();
        return () => observer?.disconnect();
    }, [trigger, boundary, panel, scheduleUpdate]);

    useEffect(() => {
        window.addEventListener('resize', scheduleUpdate);
        window.addEventListener('scroll', scheduleUpdate, true);
        return () => {
            cancelAnimationFrame(frame.current);
            window.removeEventListener('resize', scheduleUpdate);
            window.removeEventListener('scroll', scheduleUpdate, true);
        };
    }, [scheduleUpdate]);

    return style;
}

/**
 * Keeps a nested submenu inside the viewport: it opens to the left when there
 * is room there, and otherwise shifts back over its parent menu.
 */
export function placeNestedMenu(entry: HTMLElement): void {
    const nested = entry.querySelector<HTMLElement>(':scope > .erag-menu--nested');
    if (!nested) return;
    nested.classList.remove('erag-menu--flip');
    nested.style.removeProperty('left');
    nested.style.removeProperty('top');
    const rect = nested.getBoundingClientRect();
    const entryRect = entry.getBoundingClientRect();
    const maxRight = window.innerWidth - VIEWPORT_PADDING;
    const maxBottom = window.innerHeight - VIEWPORT_PADDING;
    if (rect.right > maxRight) {
        if (entryRect.left - rect.width >= VIEWPORT_PADDING)
            nested.classList.add('erag-menu--flip');
        else {
            const left = Math.max(VIEWPORT_PADDING, maxRight - rect.width);
            nested.style.left = `${left - entryRect.left}px`;
        }
    }
    if (rect.bottom > maxBottom) {
        const top = Math.max(VIEWPORT_PADDING, rect.top - (rect.bottom - maxBottom));
        nested.style.top = `${top - entryRect.top}px`;
    }
}
