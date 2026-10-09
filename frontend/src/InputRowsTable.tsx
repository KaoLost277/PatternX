import {
  rowDetailsTableCellClasses,
  rowDetailsTableHeaderClasses,
  separatedSummaryTableClasses,
  summaryTableFrameClasses,
} from "./uiClasses";

interface InputRowsTableProps {
  ariaLabel: string;
  columns: string[];
  rows: (string | null)[][];
}

export function InputRowsTable({ ariaLabel, columns, rows }: InputRowsTableProps) {
  return (
    <div
      className={`${summaryTableFrameClasses} max-h-[min(56vh,35rem)] overflow-auto overscroll-contain`}
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <table className={separatedSummaryTableClasses}>
        <thead>
          <tr>
            {columns.map((columnName, columnIndex) => (
              <th
                className={rowDetailsTableHeaderClasses}
                key={columnIndex}
                scope="col"
              >
                {columnName}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((_, columnIndex) => (
                <td className={rowDetailsTableCellClasses} key={columnIndex}>
                  <span className="[overflow-wrap:anywhere]">
                    {row[columnIndex] ?? "Not set"}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
