import { useState } from 'react';
import { classNames } from '../../utils/events';
import { BaseDialog } from './BaseDialog';

interface TableDialogProps {
    size: number;
    onClose: () => void;
    onSave: (rows: number, columns: number) => void;
}

export function TableDialog({ size, onClose, onSave }: TableDialogProps) {
    const [rows, setRows] = useState(2);
    const [columns, setColumns] = useState(2);
    const cells = Array.from({ length: size * size }, (_, offset) => offset + 1);

    return (
        <BaseDialog
            title="Insert table"
            compact
            onClose={onClose}
        >
            <div
                className="erag-table-grid"
                role="grid"
                aria-label={`${rows} by ${columns} table`}
            >
                {cells.map((index) => {
                    const row = Math.ceil(index / size);
                    const column = ((index - 1) % size) + 1;
                    const highlight = (): void => {
                        setRows(row);
                        setColumns(column);
                    };
                    return (
                        <button
                            key={index}
                            type="button"
                            className={classNames(
                                'erag-table-grid__cell',
                                row <= rows && column <= columns && 'erag-is-active',
                            )}
                            aria-label={`${row} rows by ${column} columns`}
                            onMouseEnter={highlight}
                            onFocus={highlight}
                            onClick={() => onSave(row, column)}
                        />
                    );
                })}
            </div>
            <p className="erag-table-grid__label">
                {rows} × {columns}
            </p>
        </BaseDialog>
    );
}
