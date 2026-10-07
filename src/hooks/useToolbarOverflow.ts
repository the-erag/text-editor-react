import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useIsomorphicLayoutEffect } from './useSetup';

const OVERFLOW_BUTTON_WIDTH = 34;
const OVERFLOW_GAP = 4;

function horizontalSize(element: HTMLElement | null): number {
    return element?.getBoundingClientRect().width ?? 0;
}

export function useToolbarOverflow(
    container: RefObject<HTMLElement | null>,
    itemCount: number,
    layoutKey: string,
): number {
    const [visibleCount, setVisibleCount] = useState(itemCount);
    const [measureRequest, setMeasureRequest] = useState(0);
    const groupWidths = useRef<number[]>([]);
    const itemCountRef = useRef(itemCount);
    itemCountRef.current = itemCount;

    const measure = useCallback((): void => {
        const element = container.current;
        if (!element) return;
        const count = itemCountRef.current;
        const widths = groupWidths.current;
        const styles = window.getComputedStyle(element);

        // A toolbar that scrolls sideways (narrow screens) shows every group.
        if (styles.overflowX !== 'visible') {
            setVisibleCount(count);
            return;
        }

        const renderedGroups = element.querySelectorAll<HTMLElement>(
            '[data-erag-toolbar-group-index]',
        );

        renderedGroups.forEach((group) => {
            const index = Number(group.dataset.eragToolbarGroupIndex);
            if (Number.isInteger(index)) {
                widths[index] = group.getBoundingClientRect().width;
            }
        });

        if (widths.slice(0, count).some((width) => !width)) return;

        const padding =
            Number.parseFloat(styles.paddingInlineStart) +
            Number.parseFloat(styles.paddingInlineEnd);
        const startWidth = horizontalSize(
            element.querySelector<HTMLElement>('[data-erag-toolbar-start]'),
        );
        const endWidth = horizontalSize(
            element.querySelector<HTMLElement>('[data-erag-toolbar-end]'),
        );
        const availableWidth = Math.max(0, element.clientWidth - padding - startWidth - endWidth);
        const totalGroupWidth = widths.slice(0, count).reduce((total, width) => total + width, 0);

        if (totalGroupWidth <= availableWidth) {
            setVisibleCount(count);
            return;
        }

        const availableGroupWidth = Math.max(
            0,
            availableWidth - OVERFLOW_BUTTON_WIDTH - OVERFLOW_GAP,
        );
        let usedWidth = 0;
        let nextVisibleCount = 0;

        for (const width of widths.slice(0, count)) {
            if (usedWidth + width > availableGroupWidth) break;
            usedWidth += width;
            nextVisibleCount += 1;
        }

        setVisibleCount(nextVisibleCount);
    }, [container]);

    const initialLayout = useRef(`${itemCount}|${layoutKey}`);
    useEffect(() => {
        const key = `${itemCount}|${layoutKey}`;
        if (initialLayout.current === key) return;
        initialLayout.current = key;
        groupWidths.current.length = 0;
        setVisibleCount(itemCount);
        setMeasureRequest((request) => request + 1);
    }, [itemCount, layoutKey]);

    useIsomorphicLayoutEffect(() => measure(), [measure, measureRequest]);

    useEffect(() => {
        const element = container.current;
        if (!element) return;
        const remeasure = (): void => measure();
        const observer =
            typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(remeasure);
        observer?.observe(element);
        // The overflow mode comes from a media query, which can switch without a size change.
        window.addEventListener('resize', remeasure);
        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', remeasure);
        };
    }, [container, measure]);

    return visibleCount;
}
