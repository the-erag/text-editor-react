import { useRef, type KeyboardEvent } from 'react';
import { resolveMenuItemIcon } from '../../config/menuIcons';
import { isReadOnlyAction } from '../../constants/editorCommands';
import { placeNestedMenu, useFloatingPosition } from '../../hooks/useFloatingPosition';
import type { MenuItemDefinition } from '../../types';
import { classNames, preventDefault } from '../../utils/events';
import { EditorIcon } from '../icons/EditorIcon';

interface FloatingMenuProps {
    items: MenuItemDefinition[];
    /** Menubar button the top-level menu is anchored to. */
    anchor?: HTMLElement | null;
    disabled: boolean;
    locked: boolean;
    activeCommands: Record<string, boolean>;
    availableCommands: Record<string, boolean>;
    insideTable: boolean;
    level?: number;
    onSelect: (item: MenuItemDefinition) => void;
    onClose: () => void;
}

export function FloatingMenu(props: FloatingMenuProps) {
    const { items, disabled, locked, activeCommands, availableCommands, insideTable } = props;
    const { onSelect, onClose } = props;
    const level = props.level ?? 0;
    const menu = useRef<HTMLDivElement>(null);
    const floatingStyle = useFloatingPosition(
        level === 0 ? (props.anchor ?? null) : null,
        menu,
        null,
    );

    function isDisabled(item: MenuItemDefinition): boolean {
        const explicitlyUnavailable = Boolean(
            item.command && availableCommands[item.command] === false,
        );
        return (
            disabled ||
            (locked && !worksWhileLocked(item)) ||
            explicitlyUnavailable ||
            Boolean(item.tableOnly && !insideTable)
        );
    }
    function isActive(item: MenuItemDefinition): boolean {
        return Boolean(item.command && !isDisabled(item) && activeCommands[item.command]);
    }
    function select(item: MenuItemDefinition): void {
        if (!item.children && !item.separator && !isDisabled(item)) onSelect(item);
    }
    function onKeydown(event: KeyboardEvent<HTMLDivElement>): void {
        const target = event.target as HTMLElement;
        const buttons = menu.current
            ? [
                  ...menu.current.querySelectorAll<HTMLElement>(
                      ':scope > .erag-menu__entry > .erag-menu__item:not([aria-disabled="true"])',
                  ),
              ]
            : [];
        if (event.key === 'Escape') {
            onClose();
            return;
        }
        if (!buttons.includes(target)) return;
        const index = buttons.indexOf(target);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const offset = event.key === 'ArrowDown' ? 1 : -1;
            buttons[(index + offset + buttons.length) % buttons.length]?.focus();
        }
        if (event.key === 'Home') {
            event.preventDefault();
            buttons[0]?.focus();
        }
        if (event.key === 'End') {
            event.preventDefault();
            buttons.at(-1)?.focus();
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            target.click();
        }
    }

    return (
        <div
            ref={menu}
            className={classNames('erag-menu', level > 0 && 'erag-menu--nested')}
            style={level === 0 ? floatingStyle : undefined}
            role="menu"
            onKeyDown={onKeydown}
        >
            {items.map((item) =>
                item.separator ? (
                    <div
                        key={item.id}
                        className="erag-menu__separator"
                        role="separator"
                    />
                ) : (
                    <div
                        key={item.id}
                        className="erag-menu__entry"
                        onMouseEnter={item.children ? placeNested : undefined}
                        onFocus={item.children ? placeNested : undefined}
                    >
                        <button
                            type="button"
                            className={classNames(
                                'erag-menu__item',
                                isActive(item) && 'erag-is-active',
                            )}
                            role="menuitem"
                            aria-haspopup={Boolean(item.children)}
                            aria-disabled={isDisabled(item)}
                            tabIndex={isDisabled(item) ? -1 : 0}
                            onMouseDown={preventDefault}
                            onClick={() => select(item)}
                        >
                            <span className="erag-menu__check">{isActive(item) ? '✓' : ''}</span>
                            {level === 0 && (
                                <EditorIcon
                                    className="erag-menu__icon"
                                    name={resolveMenuItemIcon(item)}
                                    size={16}
                                />
                            )}
                            <span className="erag-menu__label">{item.label}</span>
                            {item.shortcut && (
                                <span className="erag-menu__shortcut">{item.shortcut}</span>
                            )}
                            {item.children && <span className="erag-menu__arrow">›</span>}
                        </button>
                        {item.children && (
                            <FloatingMenu
                                items={item.children}
                                disabled={disabled}
                                locked={locked}
                                activeCommands={activeCommands}
                                availableCommands={availableCommands}
                                insideTable={insideTable}
                                level={level + 1}
                                onSelect={onSelect}
                                onClose={onClose}
                            />
                        )}
                    </div>
                ),
            )}
        </div>
    );
}

function placeNested(event: { currentTarget: HTMLElement }): void {
    placeNestedMenu(event.currentTarget);
}

function worksWhileLocked(item: MenuItemDefinition): boolean {
    return isReadOnlyAction(item) || Boolean(item.children?.some(worksWhileLocked));
}
