import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after, test } from "node:test";
import { createServer } from "vite";

const viteServer = await createServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});

function findFirstButton(element) {
  if (Array.isArray(element)) {
    for (const child of element) {
      const button = findFirstButton(child);
      if (button !== null) {
        return button;
      }
    }
    return null;
  }

  if (!React.isValidElement(element)) {
    return null;
  }
  if (element.type === "button") {
    return element;
  }

  return findFirstButton(element.props.children);
}

function findButtonByLabel(element, label) {
  if (Array.isArray(element)) {
    for (const child of element) {
      const button = findButtonByLabel(child, label);
      if (button !== null) {
        return button;
      }
    }
    return null;
  }

  if (!React.isValidElement(element)) {
    return null;
  }
  if (element.type === "button" && element.props["aria-label"] === label) {
    return element;
  }

  return findButtonByLabel(element.props.children, label);
}

after(async () => {
  await viteServer.close();
});

test("frequency chart ranks the exact Top 10 and keeps counts and shares visible", async () => {
  const { FrequencyBarChart } = await viteServer.ssrLoadModule(
    "/src/FrequencyBarChart.tsx",
  );
  const items = Array.from({ length: 12 }, (_, index) => ({
    key: `pattern-${index + 1}`,
    sourceIndex: index,
    label: `Pattern ${index + 1}`,
    count: 12 - index,
    share: (12 - index) / 30,
    detailLabel: `pattern ${index + 1}`,
  })).reverse();
  const markup = renderToStaticMarkup(
    React.createElement(FrequencyBarChart, {
      title: "Completeness Pattern frequency",
      categoryName: "Completeness Patterns",
      denominatorDescription: "of all Input Rows",
      items,
      onSelect: () => {},
    }),
  );

  assert.match(markup, /Completeness Pattern frequency/);
  assert.match(markup, /Showing the top 10 of 12 Completeness Patterns/);
  assert.ok(markup.indexOf("Pattern 1") < markup.indexOf("Pattern 2"));
  assert.ok(markup.indexOf("Pattern 9") < markup.indexOf("Pattern 10"));
  assert.doesNotMatch(markup, /Pattern 11|Pattern 12|Other/);
  assert.match(markup, /12 Input Rows/);
  assert.match(markup, /40% of all Input Rows/);
  assert.match(markup, /aria-label="View Input Rows for pattern 1/);
  assert.match(markup, /active:bg-surface-accent/);
  assert.match(markup, /focus-visible:outline-focus-ring/);
});

test("frequency chart exposes full hostile labels as inert accessible text", async () => {
  const { FrequencyBarChart } = await viteServer.ssrLoadModule(
    "/src/FrequencyBarChart.tsx",
  );
  const fullLabel = `<script>${"long-value-".repeat(12)}</script>`;
  const markup = renderToStaticMarkup(
    React.createElement(FrequencyBarChart, {
      title: "Terms in account_code",
      categoryName: "Formal Terms",
      denominatorDescription: "of non-missing Input Rows in account_code",
      items: [
        {
          key: "term-1",
          sourceIndex: 0,
          label: fullLabel,
          count: 2,
          share: 1,
          detailLabel: `term ${JSON.stringify(fullLabel)}`,
        },
      ],
      onSelect: () => {},
    }),
  );

  assert.match(markup, /aria-label="View Input Rows for term/);
  assert.ok(markup.includes("&lt;script&gt;"));
  assert.doesNotMatch(markup, /<script\b/i);
  assert.match(markup, /title="&lt;script&gt;/);
  assert.match(markup, /100% of non-missing Input Rows in account_code/);
});

test("frequency chart explains an empty result without drawing a zero category", async () => {
  const { FrequencyBarChart } = await viteServer.ssrLoadModule(
    "/src/FrequencyBarChart.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(FrequencyBarChart, {
      title: "Formal Terms in empty_column",
      categoryName: "Formal Terms",
      denominatorDescription: "of non-missing Input Rows in empty_column",
      items: [],
      onSelect: () => {},
    }),
  );

  assert.match(markup, /No Formal Terms are available to chart/);
  assert.doesNotMatch(markup, /<li|Other/);
});

test("Completeness Patterns chart labels statuses and ranks the complete result", async () => {
  const { CompletenessPatternsChart } = await viteServer.ssrLoadModule(
    "/src/CompletenessPatternsChart.tsx",
  );
  const summary = {
    input_rows: 30,
    identifier_column: null,
    analysis_columns: ["email", "phone"],
    patterns: Array.from({ length: 12 }, (_, index) => ({
      statuses: [index % 2 === 0 ? "present" : "missing", "missing"],
      count: 12 - index,
      share: (12 - index) / 30,
      preview_rows: [],
    })),
  };
  const markup = renderToStaticMarkup(
    React.createElement(CompletenessPatternsChart, {
      summary,
      onPatternSelected: () => {},
    }),
  );

  assert.match(markup, /Most common Completeness Patterns/);
  assert.match(markup, /email: present, phone: missing/);
  assert.match(markup, /email: missing, phone: missing/);
  assert.match(markup, /Showing the top 10 of 12 Completeness Patterns/);
  assert.doesNotMatch(markup, /Pattern 11|Pattern 12|Other/);
});

test("selecting a ranked Completeness Pattern keeps its canonical row-detail index", async () => {
  const { CompletenessPatternsChart } = await viteServer.ssrLoadModule(
    "/src/CompletenessPatternsChart.tsx",
  );
  const summary = {
    input_rows: 10,
    identifier_column: null,
    analysis_columns: ["status"],
    patterns: [
      { statuses: ["present"], count: 1, share: 0.1, preview_rows: [] },
      { statuses: ["missing"], count: 9, share: 0.9, preview_rows: [] },
    ],
  };
  let selectedPatternIndex = null;
  const chartElement = CompletenessPatternsChart({
    summary,
    onPatternSelected: (patternIndex) => {
      selectedPatternIndex = patternIndex;
    },
  });
  const chartTree = chartElement.type(chartElement.props);
  const firstButton = findFirstButton(chartTree);

  assert.ok(firstButton);
  firstButton.props.onClick();
  assert.equal(selectedPatternIndex, 1);
});

test("Column Completeness chart shows every column and ranks missing share first", async () => {
  const { ColumnCompletenessChart } = await viteServer.ssrLoadModule(
    "/src/ColumnCompletenessChart.tsx",
  );
  const columns = [
    {
      name: "complete",
      present_count: 4,
      present_share: 1,
      missing_count: 0,
      missing_share: 0,
    },
    {
      name: "partly_missing",
      present_count: 2,
      present_share: 0.5,
      missing_count: 2,
      missing_share: 0.5,
    },
    {
      name: "all_missing",
      present_count: 0,
      present_share: 0,
      missing_count: 4,
      missing_share: 1,
    },
  ];
  const markup = renderToStaticMarkup(
    React.createElement(ColumnCompletenessChart, {
      columns,
      inputRows: 4,
      onStatusSelected: () => {},
    }),
  );

  assert.match(markup, /Column Completeness by column/);
  assert.ok(markup.indexOf(">all_missing</h4>") < markup.indexOf(">partly_missing</h4>"));
  assert.ok(markup.indexOf(">partly_missing</h4>") < markup.indexOf(">complete</h4>"));
  assert.match(markup, /Present: 2 \(50%\)/);
  assert.match(markup, /Missing: 2 \(50%\)/);
  assert.match(markup, /aria-label="View Input Rows with missing values in all_missing/);
  assert.match(markup, /Order columns by/);
  assert.match(markup, /Scroll to view all columns/);
  assert.match(markup, /Scroll horizontally to select each status/);
  assert.doesNotMatch(markup, /overflow-hidden/);
  assert.match(markup, /min-h-10 min-w-10/);
  assert.match(markup, /hover:opacity-90 active:opacity-80/);
  assert.match(markup, /focus-visible:outline-focus-ring/);
});

test("selecting a Column Completeness segment requests its source column and status", async () => {
  const { ColumnCompletenessChartView } = await viteServer.ssrLoadModule(
    "/src/ColumnCompletenessChart.tsx",
  );
  const columns = [
    {
      name: "email",
      present_count: 3,
      present_share: 0.75,
      missing_count: 1,
      missing_share: 0.25,
    },
  ];
  let selectedStatus = null;
  const tree = ColumnCompletenessChartView({
    columns,
    inputRows: 4,
    columnOrder: "missing",
    onColumnOrderChanged: () => {},
    onStatusSelected: (columnIndex, status) => {
      selectedStatus = { columnIndex, status };
    },
  });
  const missingButton = findButtonByLabel(
    tree,
    "View Input Rows with missing values in email. 1 Input Rows, 25% of all Input Rows.",
  );

  assert.ok(missingButton);
  missingButton.props.onClick();
  assert.deepEqual(selectedStatus, { columnIndex: 0, status: "missing" });
});
