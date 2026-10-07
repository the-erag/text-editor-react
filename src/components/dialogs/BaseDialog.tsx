import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '../../hooks/useScrollLock';
import { focusableElements } from '../../utils/dom';
import { classNames } from '../../utils/events';

interface BaseDialogProps {
    title: string;
    wide?: boolean;
    compact?: boolean;
    closeLabel?: string;
    footerDivider?: boolean;
    bodyClass?: string;
    footer?: ReactNode;
    children?: ReactNode;
    onClose: () => void;
}

export function BaseDialog({
    title,
    wide = false,
    compact = false,
    closeLabel = 'Close',
    footerDivider = true,
    bodyClass = '',
    footer,
    children,
    onClose,
}: BaseDialogProps) {
    const panel = useRef<HTMLElement>(null);
    useScrollLock();

    useEffect(() => {
        if (panel.current) focusableElements(panel.current)[0]?.focus();
    }, []);

    function keydown(event: KeyboardEvent<HTMLElement>): void {
        if (event.key === 'Escape') {
            onClose();
            return;
        }
        if (event.key !== 'Tab' || !panel.current) return;
        const items = focusableElements(panel.current);
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && event.target === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && event.target === last) {
            event.preventDefault();
            first?.focus();
        }
    }

    return createPortal(
        <div
            className="erag-dialog-backdrop"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <section
                ref={panel}
                className={classNames(
                    'erag-dialog',
                    wide && 'erag-dialog--wide',
                    compact && 'erag-dialog--compact',
                )}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onKeyDown={keydown}
            >
                <header className="erag-dialog__header">
                    <h2 className="erag-dialog__title">{title}</h2>
                    <button
                        type="button"
                        className="erag-dialog__close"
                        aria-label={closeLabel}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </header>
                <div className={classNames('erag-dialog__body', bodyClass)}>{children}</div>
                {footer != null && (
                    <footer
                        className={classNames(
                            'erag-dialog__footer',
                            footerDivider && 'erag-dialog__footer--divided',
                        )}
                    >
                        {footer}
                    </footer>
                )}
            </section>
        </div>,
        document.body,
    );
}
