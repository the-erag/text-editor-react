import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import { TOOLBAR_ITEMS, parseToolbar } from '../config/toolbarConfig';
import { isReadOnlyAction } from '../constants/editorCommands';
import { useFloatingPosition } from '../hooks/useFloatingPosition';
import { useLatest } from '../hooks/useSetup';
import { useToolbarOverflow } from '../hooks/useToolbarOverflow';
import type {
    EditorToolbarGroup,
    EditorToolbarItemName,
    ListCommand,
    ResolvedEditorInit,
    TextAlignmentCommand,
    TextCaseMode,
    ToolbarItemDefinition,
} from '../types';
import { AlignmentMenu } from './toolbar/AlignmentMenu';
import { CaseChangeMenu } from './toolbar/CaseChangeMenu';
import { ColorPalette } from './toolbar/ColorPalette';
import { LineHeightMenu } from './toolbar/LineHeightMenu';
import { ListMenu } from './toolbar/ListMenu';
import { ToolbarButton } from './toolbar/ToolbarButton';

interface EditorToolbarProps {
    toolbar: boolean | string | EditorToolbarGroup[];
    config: ResolvedEditorInit;
    activeCommands: Record<string, boolean>;
    availableCommands: Record<string, boolean>;
    disabled: boolean;
    locked: boolean;
    insideTable: boolean;
    start?: ReactNode;
    end?: ReactNode;
    onCommand: (id: string, value?: string) => void;
    onDialog: (name: string) => void;
}

const ALIGNMENT_COMMANDS: TextAlignmentCommand[] = [
    'alignleft',
    'aligncenter',
    'alignright',
    'alignjustify',
];

export function EditorToolbar(props: EditorToolbarProps) {
    const { config, activeCommands, availableCommands, disabled, locked, start, end } = props;
    const container = useRef<HTMLDivElement>(null);
    const popover = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState<string | null>(null);
    const [moreExpanded, setMoreExpanded] = useState(false);
    const [selectedCase, setSelectedCase] = useState<TextCaseMode | null>(null);
    const [selectedLineHeight, setSelectedLineHeight] = useState<string | null>(null);
    const [selectedListStyles, setSelectedListStyles] = useState<Record<ListCommand, string>>({
        bullist: '',
        numlist: '',
    });
    const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
    const popoverStyle = useFloatingPosition(open ? popoverAnchor : null, popover, null);
    const selectedAlignment =
        ALIGNMENT_COMMANDS.find((command) => activeCommands[command]) ?? 'alignleft';
    const selectedList: ListCommand | null = activeCommands.numlist
        ? 'numlist'
        : activeCommands.bullist
          ? 'bullist'
          : null;
    const openListCommand: ListCommand | null =
        open === 'bullist' || open === 'numlist' ? open : null;
    const groups = parseToolbar(props.toolbar)
        .map((group) => ({
            ...group,
            items: group.items.filter((name) => name !== 'more' && available(TOOLBAR_ITEMS[name])),
        }))
        .filter((group) => group.items.length > 0);
    const layoutKey = groups.map((group) => `${group.name}:${group.items.join(',')}`).join('|');
    const visibleCount = useToolbarOverflow(container, groups.length, layoutKey);
    const visible = groups.slice(0, visibleCount);
    const overflow = groups.slice(visibleCount);
    const state = useLatest({ moreExpanded });

    function available(item: ToolbarItemDefinition): boolean {
        return !item.plugin || config.plugins.includes(item.plugin as never);
    }
    function togglePopover(name: string, event: MouseEvent<HTMLElement>): void {
        const willOpen = open !== name;
        setOpen(willOpen ? name : null);
        setPopoverAnchor(willOpen ? event.currentTarget : null);
    }
    function activate(item: ToolbarItemDefinition, event: MouseEvent<HTMLElement>): void {
        if (isDisabled(item)) return;
        if (item.name === 'casechange') {
            togglePopover('casechange', event);
        } else if (item.name === 'lineheight') {
            togglePopover('lineheight', event);
        } else if (item.name === 'alignment') {
            togglePopover('alignment', event);
        } else if (item.name === 'bullist' || item.name === 'numlist') {
            togglePopover(item.name, event);
        } else if (item.command) props.onCommand(item.command);
        else if (item.dialog) {
            if (item.dialog === 'forecolor' || item.dialog === 'backcolor')
                togglePopover(item.dialog, event);
            else props.onDialog(item.dialog);
        } else if (item.name === 'more') setMoreExpanded((value) => !value);
    }
    function chooseCase(mode: TextCaseMode): void {
        setSelectedCase(mode);
        props.onCommand('changeCase', mode);
        setOpen(null);
    }
    function chooseLineHeight(value: string): void {
        setSelectedLineHeight(value);
        props.onCommand('lineheight', value);
        setOpen(null);
    }
    function chooseAlignment(command: TextAlignmentCommand): void {
        props.onCommand(command);
        setOpen(null);
    }
    function chooseList(command: ListCommand, style: string): void {
        setSelectedListStyles((current) => ({ ...current, [command]: style }));
        props.onCommand(command, style);
        setOpen(null);
    }
    function isHistoryCommand(item: ToolbarItemDefinition): boolean {
        return item.command === 'undo' || item.command === 'redo';
    }
    function isAvailable(item: ToolbarItemDefinition): boolean {
        return Boolean(item.command && availableCommands[item.command]);
    }
    function isDisabled(item: ToolbarItemDefinition): boolean {
        // "More" only reveals buttons, so it stays usable while readonly.
        if (item.name === 'more') return disabled;
        return (
            disabled ||
            (locked && !isReadOnlyAction(item)) ||
            (isHistoryCommand(item) && !isAvailable(item))
        );
    }
    function isActive(item: ToolbarItemDefinition): boolean {
        if (item.name === 'casechange') return open === 'casechange';
        if (item.name === 'lineheight') return open === 'lineheight';
        if (item.name === 'alignment') return open === 'alignment';
        if (item.name === 'bullist' || item.name === 'numlist')
            return open === item.name || Boolean(activeCommands[item.name]);
        return Boolean(item.command && !isDisabled(item) && activeCommands[item.command]);
    }
    function selectValue(item: ToolbarItemDefinition, event: ChangeEvent<HTMLSelectElement>): void {
        props.onCommand(
            item.select === 'blocks' ? 'formatBlock' : (item.select ?? ''),
            event.target.value,
        );
    }
    function options(item: ToolbarItemDefinition): { label: string; value: string }[] {
        if (item.select === 'blocks') return config.blockFormats;
        if (item.select === 'fontfamily') return config.fontFamilyFormats;
        return config.fontSizeFormats;
    }
    function chooseColor(type: string, color: string): void {
        props.onCommand(type, color || (type === 'forecolor' ? '#000000' : 'transparent'));
        setOpen(null);
    }
    function renderItem(name: EditorToolbarItemName, inOverflow: boolean): ReactNode {
        const item = TOOLBAR_ITEMS[name];
        if (item.select && (inOverflow || available(item)))
            return (
                <select
                    key={name}
                    className={
                        inOverflow
                            ? 'erag-toolbar__select erag-toolbar__select--overflow'
                            : 'erag-toolbar__select'
                    }
                    aria-label={item.label}
                    disabled={isDisabled(item)}
                    defaultValue=""
                    onMouseDown={() => props.onCommand('saveSelection')}
                    onChange={(event) => selectValue(item, event)}
                >
                    <option value="">{item.label}</option>
                    {options(item).map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>
            );
        if (!inOverflow && !available(item)) return null;
        return (
            <ToolbarButton
                key={name}
                item={item}
                active={isActive(item)}
                available={isAvailable(item)}
                disabled={isDisabled(item)}
                onActivate={activate}
            />
        );
    }

    useEffect(() => {
        function outside(event: PointerEvent): void {
            const target = event.target as Node | null;
            if (target && container.current?.contains(target)) return;

            const targetElement = target instanceof Element ? target : target?.parentElement;
            if (
                state.value.moreExpanded &&
                targetElement?.closest('.erag-editor__content-wrap, .erag-dialog-backdrop')
            ) {
                setOpen(null);
                return;
            }

            setOpen(null);
            setMoreExpanded(false);
        }
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
        // Listeners read the latest state through refs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            ref={container}
            className="erag-toolbar"
            role="toolbar"
            aria-label="Text formatting toolbar"
        >
            {start != null && (
                <div
                    className="erag-toolbar__slot"
                    data-erag-toolbar-start
                >
                    {start}
                </div>
            )}
            {visible.map((group, index) => (
                <div
                    key={group.name ?? index}
                    className="erag-toolbar__group"
                    data-erag-toolbar-group-index={index}
                >
                    {group.items.map((name) => renderItem(name, false))}
                </div>
            ))}
            {overflow.length > 0 && (
                <div className="erag-toolbar__overflow">
                    <ToolbarButton
                        item={TOOLBAR_ITEMS.more}
                        active={moreExpanded}
                        available={false}
                        disabled={disabled}
                        onActivate={activate}
                    />
                </div>
            )}
            {overflow.length > 0 && moreExpanded && (
                <div
                    className="erag-toolbar__overflow-row"
                    role="toolbar"
                    aria-label="More formatting options"
                >
                    {overflow.map((group, index) => (
                        <div
                            key={group.name ?? index}
                            className="erag-toolbar__overflow-group"
                        >
                            {group.items.map((name) => renderItem(name, true))}
                        </div>
                    ))}
                </div>
            )}
            {open && (
                <div
                    ref={popover}
                    className="erag-toolbar__popover"
                    style={popoverStyle}
                >
                    {open === 'forecolor' && (
                        <ColorPalette
                            colors={config.textColors}
                            current=""
                            label="Text color"
                            onSelect={(color) => chooseColor('forecolor', color)}
                        />
                    )}
                    {open === 'casechange' && (
                        <CaseChangeMenu
                            mode={selectedCase}
                            onSelect={chooseCase}
                            onClose={() => setOpen(null)}
                        />
                    )}
                    {open === 'lineheight' && (
                        <LineHeightMenu
                            options={config.lineHeightFormats}
                            selected={selectedLineHeight}
                            onSelect={chooseLineHeight}
                            onClose={() => setOpen(null)}
                        />
                    )}
                    {open === 'alignment' && (
                        <AlignmentMenu
                            selected={selectedAlignment}
                            onSelect={chooseAlignment}
                            onClose={() => setOpen(null)}
                        />
                    )}
                    {openListCommand && (
                        <ListMenu
                            key={openListCommand}
                            command={openListCommand}
                            active={selectedList === openListCommand}
                            selectedStyle={selectedListStyles[openListCommand]}
                            onSelect={chooseList}
                            onClose={() => setOpen(null)}
                        />
                    )}
                    {open === 'backcolor' && (
                        <ColorPalette
                            colors={config.backgroundColors}
                            current=""
                            label="Background color"
                            onSelect={(color) => chooseColor('backcolor', color)}
                        />
                    )}
                </div>
            )}
            {end != null && (
                <div
                    className="erag-toolbar__slot erag-toolbar__slot--end"
                    data-erag-toolbar-end
                >
                    {end}
                </div>
            )}
        </div>
    );
}
