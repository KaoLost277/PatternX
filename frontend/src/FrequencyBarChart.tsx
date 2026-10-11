import type { CSSProperties } from "react";
import { formatShare } from "./displayFormat";
import { hintTextClasses, statusTextClasses } from "./uiClasses";

export interface FrequencyBarChartItem {
  key: string;
  sourceIndex: number;
  label: string;
  count: number;
  share: number;
  detailLabel: string;
}

interface FrequencyBarChartProps {
  title: string;
  categoryName: string;
  denominatorDescription: string;
  items: readonly FrequencyBarChartItem[];
  onSelect: (item: FrequencyBarChartItem) => void;
}

const FREQUENCY_CHART_PREVIEW_LIMIT = 10;

function formatCount(count: number): string {
  return count.toLocaleString();
}

function inputRowLabel(count: number): string {
  return count === 1 ? "Input Row" : "Input Rows";
}

export function FrequencyBarChart({
  title,
  categoryName,
  denominatorDescription,
  items,
  onSelect,
}: FrequencyBarChartProps) {
  const rankedItems = items
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((left, right) => {
      const countDifference = right.item.count - left.item.count;
      return countDifference === 0 ? left.sourceIndex - right.sourceIndex : countDifference;
    });
  const chartItems = rankedItems.slice(0, FREQUENCY_CHART_PREVIEW_LIMIT);
  const highestCount = chartItems[0]?.item.count ?? 0;

  return (
    <section className="grid min-w-0 gap-3" aria-label={title}>
      <div className="grid min-w-0 gap-1">
        <h4 className="m-0 text-sm font-semibold text-text">{title}</h4>
        {items.length === 0 ? (
          <p className={hintTextClasses} role="status">
            No {categoryName} are available to chart.
          </p>
        ) : (
          <p className={statusTextClasses}>
            Showing the top {chartItems.length} of {items.length.toLocaleString()} {categoryName}.
          </p>
        )}
      </div>

      {chartItems.length > 0 && (
        <ol className="m-0 grid min-w-0 list-none gap-2 p-0" aria-label={title}>
          {chartItems.map(({ item }) => {
            const relativeBarWidth = highestCount === 0 ? 0 : (item.count / highestCount) * 100;
            const barStyle: CSSProperties = { width: `${relativeBarWidth}%` };
            const share = formatShare(item.share);
            const accessibleLabel =
              `View Input Rows for ${item.detailLabel}. ` +
              `${formatCount(item.count)} ${inputRowLabel(item.count)}, ` +
              `${share} ${denominatorDescription}.`;

            return (
              <li className="min-w-0" key={item.key}>
                <button
                  type="button"
                  className={[
                    "grid min-h-11 w-full min-w-0 gap-1 rounded-control border border-border",
                    "bg-surface px-3 py-2 text-left hover:bg-surface-muted active:bg-surface-accent",
                    "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring",
                  ].join(" ")}
                  aria-label={accessibleLabel}
                  title={accessibleLabel}
                  onClick={() => onSelect(item)}
                >
                  <span className="min-w-0 truncate font-medium text-text" title={item.label}>
                    {item.label}
                  </span>
                  <span
                    className="block h-2 min-w-0 overflow-hidden rounded-full bg-surface-accent"
                    aria-hidden="true"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={barStyle}
                    />
                  </span>
                  <span className="break-words text-sm text-text-secondary">
                    {formatCount(item.count)} {inputRowLabel(item.count)} · {share}{" "}
                    {denominatorDescription}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
