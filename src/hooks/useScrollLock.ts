import { useEffect } from 'react';

interface SavedStyles {
    htmlOverflow: string;
    bodyOverflow: string;
    bodyPaddingRight: string;
}

/** Shared by every dialog and editor on the page, so the last one to close restores scrolling. */
let lockCount = 0;
let saved: SavedStyles | null = null;

function lock(): void {
    lockCount += 1;
    if (lockCount > 1) return;
    const html = document.documentElement;
    const body = document.body;
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    saved = {
        htmlOverflow: html.style.overflow,
        bodyOverflow: body.style.overflow,
        bodyPaddingRight: body.style.paddingRight,
    };
    if (scrollbarWidth > 0) {
        const padding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${padding + scrollbarWidth}px`;
    }
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
}

function unlock(): void {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount > 0 || !saved) return;
    document.documentElement.style.overflow = saved.htmlOverflow;
    document.body.style.overflow = saved.bodyOverflow;
    document.body.style.paddingRight = saved.bodyPaddingRight;
    saved = null;
}

/**
 * Stops the page behind an open dialog from scrolling. The scrollbar width is
 * added as body padding so the page does not shift sideways.
 */
export function useScrollLock(): void {
    useEffect(() => {
        lock();
        return unlock;
    }, []);
}
