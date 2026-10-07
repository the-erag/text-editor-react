import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MENU_DEFINITIONS } from '../config/menuConfig';
import type {
    DateTimeFormatOption,
    EditorMenuName,
    LineHeightOption,
    MenuItemDefinition,
    ResolvedEditorTemplatesConfig,
    ResolvedMergeTagConfig,
} from '../types';
import { formatDateTime, mergeDateTimeFormats } from '../utils/dateTime';
import { classNames, preventDefault } from '../utils/events';
import { EditorIcon } from './icons/EditorIcon';
import { FloatingMenu } from './menus/FloatingMenu';

interface EditorMenuBarProps {
    menus: true | EditorMenuName[];
    plugins: string[];
    disabled: boolean;
    locked: boolean;
    activeCommands: Record<string, boolean>;
    availableCommands: Record<string, boolean>;
    insideTable: boolean;
    lineHeightFormats: LineHeightOption[];
    dateFormats: DateTimeFormatOption[];
    timeFormats: DateTimeFormatOption[];
    mergeTags: ResolvedMergeTagConfig;
    templates: ResolvedEditorTemplatesConfig;
    mergeTagSidebarOpen: boolean;
    templateDialogOpen: boolean;
    end?: ReactNode;
    onSelect: (item: MenuItemDefinition) => void;
    onOpening: (name: EditorMenuName) => void;
    onMergeTagToggle: () => void;
    onTemplatesOpen: () => void;
}

export function EditorMenuBar(props: EditorMenuBarProps) {
    const [open, setOpen] = useState<EditorMenuName | null>(null);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [pendingSelection, setPendingSelection] = useState<MenuItemDefinition | null>(null);
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const root = useRef<HTMLDivElement>(null);
    const definitions = MENU_DEFINITIONS.filter(
        (menu) =>
            (props.menus === true || props.menus.includes(menu.name)) &&
            (menu.name !== 'merge-tags' ||
                (props.plugins.includes('merge-tags') &&
                    props.mergeTags.enabled &&
                    props.mergeTags.items.length > 0)) &&
            (menu.name !== 'templates' ||
                (props.plugins.includes('templates') &&
                    props.templates.enabled &&
                    props.templates.items.length > 0)),
    ).map((menu) => ({ ...menu, items: resolveItems(menu.items) }));

    function resolveItems(items: MenuItemDefinition[]): MenuItemDefinition[] {
        return items
            .filter((item) => !item.plugin || props.plugins.includes(item.plugin))
            .map((item) => {
                let children = item.children;
                if (item.id === 'line-height')
                    children = props.lineHeightFormats.map((option) => ({
                        id: `line-height-${option.value}`,
                        label: option.label,
                        command: 'lineheight',
                        value: option.value,
                    }));
                if (item.id === 'date-time')
                    children = mergeDateTimeFormats(props.dateFormats, props.timeFormats).map(
                        (option, index) => ({
                            id: `date-time-${index}`,
                            label: formatDateTime(option, currentDate),
                            command: 'dateTime',
                            value: String(index),
                        }),
                    );
                return children ? { ...item, children: resolveItems(children) } : item;
            });
    }
    function isMenuDisabled(name: EditorMenuName): boolean {
        return props.disabled || (props.locked && (name === 'merge-tags' || name === 'templates'));
    }
    function toggle(name: EditorMenuName, button: HTMLElement): void {
        if (isMenuDisabled(name)) return;
        setCurrentDate(new Date());
        props.onOpening(name);
        if (name === 'merge-tags') {
            setOpen(null);
            props.onMergeTagToggle();
            return;
        }
        if (name === 'templates') {
            setOpen(null);
            props.onTemplatesOpen();
            return;
        }
        setAnchor(button);
        setOpen((current) => (current === name ? null : name));
    }
    function isOpen(name: EditorMenuName): boolean {
        if (name === 'merge-tags') return props.mergeTagSidebarOpen;
        if (name === 'templates') return props.templateDialogOpen;
        return open === name;
    }
    function select(item: MenuItemDefinition): void {
        setOpen(null);
        setPendingSelection(item);
    }

    const onSelect = props.onSelect;
    useEffect(() => {
        if (!pendingSelection) return;
        setPendingSelection(null);
        onSelect(pendingSelection);
    }, [pendingSelection, onSelect]);

    useEffect(() => {
        function outside(event: PointerEvent): void {
            if (!root.current?.contains(event.target as Node)) setOpen(null);
        }
        function keydown(event: KeyboardEvent): void {
            if (event.key === 'Escape') setOpen(null);
        }
        document.addEventListener('pointerdown', outside);
        document.addEventListener('keydown', keydown);
        return () => {
            document.removeEventListener('pointerdown', outside);
            document.removeEventListener('keydown', keydown);
        };
    }, []);

    return (
        <div
            ref={root}
            className="erag-menubar"
            role="menubar"
            aria-label="Editor menu"
        >
            {definitions.map((menu) => (
                <div
                    key={menu.name}
                    className="erag-menubar__entry"
                >
                    <button
                        type="button"
                        className={classNames(
                            'erag-menubar__button',
                            isOpen(menu.name) && 'erag-is-active',
                        )}
                        role="menuitem"
                        aria-label={menu.label}
                        aria-expanded={isOpen(menu.name)}
                        title={menu.label}
                        disabled={isMenuDisabled(menu.name)}
                        onMouseDown={preventDefault}
                        onClick={(event) => toggle(menu.name, event.currentTarget)}
                    >
                        <EditorIcon
                            className="erag-menubar__icon"
                            name={menu.icon}
                            size={15}
                        />
                        <span className="erag-menubar__label">{menu.label}</span>
                    </button>
                    {menu.name !== 'merge-tags' &&
                        menu.name !== 'templates' &&
                        open === menu.name && (
                            <FloatingMenu
                                items={menu.items}
                                anchor={anchor}
                                disabled={props.disabled}
                                locked={props.locked}
                                activeCommands={props.activeCommands}
                                availableCommands={props.availableCommands}
                                insideTable={props.insideTable}
                                onSelect={select}
                                onClose={() => setOpen(null)}
                            />
                        )}
                </div>
            ))}
            {props.end != null && <div className="erag-menubar__end">{props.end}</div>}
        </div>
    );
}
