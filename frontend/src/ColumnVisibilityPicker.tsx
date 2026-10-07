import { useState } from "react";
import type { ChangeEvent } from "react";

interface ColumnVisibilityPickerProps {
  columns: string[];
  visibleColumns: string[];
  onVisibleColumnsChanged: (visibleColumns: string[]) => void;
}

export function ColumnVisibilityPicker({
  columns,
  visibleColumns,
  onVisibleColumnsChanged,
}: ColumnVisibilityPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const visibleColumnSet = new Set(visibleColumns);
  const normalizedSearchText = searchText.trim().toLocaleLowerCase();
  const filteredColumns = columns.filter((columnName) => {
    return columnName.toLocaleLowerCase().includes(normalizedSearchText);
  });

  function handleColumnVisibilityChanged(event: ChangeEvent<HTMLInputElement>) {
    const columnName = event.currentTarget.value;
    const nextVisibleColumnSet = new Set(visibleColumns);

    if (event.currentTarget.checked) {
      nextVisibleColumnSet.add(columnName);
    } else {
      nextVisibleColumnSet.delete(columnName);
    }

    onVisibleColumnsChanged(columns.filter((name) => nextVisibleColumnSet.has(name)));
  }

  return (
    <details
      className="column-visibility-picker"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary className="secondary-button column-visibility-summary">
        <span>Columns shown</span>
        <span className="column-visibility-count">
          {visibleColumns.length} of {columns.length}
        </span>
      </summary>

      {isOpen && (
        <div className="column-visibility-panel">
          <p className="hint-text">
            Choose which analyzed columns to display. This does not change the analysis or the
            Pattern filters, which still use all analyzed columns.
          </p>

          <label className="column-visibility-search">
            <span>Search columns</span>
            <input
              type="search"
              value={searchText}
              aria-label="Search analyzed columns"
              onChange={(event) => setSearchText(event.currentTarget.value)}
            />
          </label>

          <div className="column-visibility-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={visibleColumns.length === columns.length}
              onClick={() => onVisibleColumnsChanged(columns)}
            >
              Show all
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={visibleColumns.length === 0}
              onClick={() => onVisibleColumnsChanged([])}
            >
              Hide all
            </button>
          </div>

          {filteredColumns.length > 0 ? (
            <div className="column-visibility-list" role="group" aria-label="Analyzed columns">
              {filteredColumns.map((columnName, columnIndex) => (
                <label className="column-visibility-option" key={columnIndex}>
                  <input
                    type="checkbox"
                    value={columnName}
                    checked={visibleColumnSet.has(columnName)}
                    onChange={handleColumnVisibilityChanged}
                  />
                  <span>{columnName}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="hint-text">No analyzed columns match this search.</p>
          )}
        </div>
      )}
    </details>
  );
}
