import type { PatternSummary } from "./PatternPreview";
import { FrequencyBarChart } from "./FrequencyBarChart";

interface CompletenessPatternsChartProps {
  summary: PatternSummary;
  onPatternSelected: (patternIndex: number) => void;
}

export function CompletenessPatternsChart({
  summary,
  onPatternSelected,
}: CompletenessPatternsChartProps) {
  const items = summary.patterns.map((pattern, sourceIndex) => {
    const statuses = pattern.statuses.map((status, columnIndex) => {
      const columnName = summary.analysis_columns[columnIndex] ?? `Column ${columnIndex + 1}`;
      return `${columnName}: ${status}`;
    });
    const statusDescription = statuses.join(", ");
    const patternNumber = sourceIndex + 1;

    return {
      key: `pattern-${sourceIndex}`,
      sourceIndex,
      label: `Pattern ${patternNumber}${statusDescription.length > 0 ? ` · ${statusDescription}` : ""}`,
      count: pattern.count,
      share: pattern.share,
      detailLabel: `Completeness Pattern ${patternNumber}`,
    };
  });

  return (
    <FrequencyBarChart
      title="Most common Completeness Patterns"
      categoryName="Completeness Patterns"
      denominatorDescription="of all Input Rows"
      items={items}
      onSelect={(item) => onPatternSelected(item.sourceIndex)}
    />
  );
}
