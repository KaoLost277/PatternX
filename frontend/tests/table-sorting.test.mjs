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

after(async () => {
  await viteServer.close();
});

test("sort state cycles ascending, descending, then back to the original order", async () => {
  const { cycleSort } = await viteServer.ssrLoadModule("/src/tableSorting.ts");

  const ascending = cycleSort(null, "count");
  assert.deepEqual(ascending, { key: "count", direction: "ascending" });

  const descending = cycleSort(ascending, "count");
  assert.deepEqual(descending, { key: "count", direction: "descending" });

  assert.equal(cycleSort(descending, "count"), null);
  assert.deepEqual(cycleSort(descending, "share"), {
    key: "share",
    direction: "ascending",
  });
});

test("numeric sorting is numeric and preserves original order for ties", async () => {
  const { sortRows, compareNumbers } = await viteServer.ssrLoadModule(
    "/src/tableSorting.ts",
  );
  const rows = [
    { name: "twenty", value: 20 },
    { name: "first five", value: 5 },
    { name: "second five", value: 5 },
  ];
  const compareByValue = (_key, left, right) => compareNumbers(left.value, right.value);

  assert.deepEqual(
    sortRows(rows, { key: "value", direction: "ascending" }, compareByValue).map(
      (row) => row.name,
    ),
    ["first five", "second five", "twenty"],
  );
  assert.deepEqual(
    sortRows(rows, { key: "value", direction: "descending" }, compareByValue).map(
      (row) => row.name,
    ),
    ["twenty", "first five", "second five"],
  );
  assert.deepEqual(sortRows(rows, null, compareByValue), rows);
});

test("source-indexed sorting keeps detail indices attached to their original rows", async () => {
  const { sortRows, compareText } = await viteServer.ssrLoadModule(
    "/src/tableSorting.ts",
  );
  const rows = [
    { name: "Beta", value: "Beta" },
    { name: "First Alpha", value: "Alpha" },
    { name: "Second Alpha", value: "Alpha" },
  ];
  const indexedRows = rows.map((row, sourceIndex) => ({ row, sourceIndex }));

  const sortedRows = sortRows(
    indexedRows,
    { key: "value", direction: "ascending" },
    (_key, left, right) => compareText(left.row.value, right.row.value),
  );

  assert.deepEqual(
    sortedRows.map(({ row, sourceIndex }) => ({ name: row.name, sourceIndex })),
    [
      { name: "First Alpha", sourceIndex: 1 },
      { name: "Second Alpha", sourceIndex: 2 },
      { name: "Beta", sourceIndex: 0 },
    ],
  );
});

test("summary projection combines column filters with AND and ignores case for Contains", async () => {
  const { projectSummaryRows } = await viteServer.ssrLoadModule(
    "/src/summaryTable.ts",
  );
  const rows = [
    { department: "Sales Office", status: "Open" },
    { department: "sales", status: "Closed" },
    { department: "Support", status: "Open" },
  ];
  const columns = [
    {
      key: "department",
      label: "Department",
      filterValue: { kind: "nullable-text", read: (row) => row.department },
      compare: (left, right) => left.department.localeCompare(right.department),
      renderCell: (row) => row.department,
    },
    {
      key: "status",
      label: "Status",
      filterValue: { kind: "text", read: (row) => row.status },
      compare: (left, right) => left.status.localeCompare(right.status),
      renderCell: (row) => row.status,
    },
  ];

  const projection = projectSummaryRows(
    rows,
    columns,
    new Map([
      ["department", { kind: "contains", value: "sAlEs" }],
      ["status", { kind: "exact", value: "Open" }],
    ]),
    null,
    null,
  );

  assert.equal(projection.matchedCount, 1);
  assert.deepEqual(
    projection.rows.map(({ row, sourceIndex }) => ({ department: row.department, sourceIndex })),
    [{ department: "Sales Office", sourceIndex: 0 }],
  );
});

test("summary Exact preserves case and spacing while Missing matches null values", async () => {
  const { projectSummaryRows } = await viteServer.ssrLoadModule(
    "/src/summaryTable.ts",
  );
  const rows = [
    { value: "Sales" },
    { value: null },
    { value: "sales" },
    { value: "Sales " },
  ];
  const columns = [
    {
      key: "value",
      label: "Value",
      filterValue: { kind: "nullable-text", read: (row) => row.value },
      compare: (left, right) => String(left.value).localeCompare(String(right.value)),
      renderCell: (row) => row.value,
    },
  ];
  const exact = projectSummaryRows(
    rows,
    columns,
    new Map([["value", { kind: "exact", value: "Sales" }]]),
    null,
    null,
  );
  const missing = projectSummaryRows(
    rows,
    columns,
    new Map([["value", { kind: "missing" }]]),
    null,
    null,
  );

  assert.deepEqual(exact.rows.map(({ sourceIndex }) => sourceIndex), [0]);
  assert.deepEqual(missing.rows.map(({ sourceIndex }) => sourceIndex), [1]);
});

test("summary projection filters beyond the first ten, sorts raw numbers, then limits", async () => {
  const { projectSummaryRows } = await viteServer.ssrLoadModule(
    "/src/summaryTable.ts",
  );
  const rows = Array.from({ length: 13 }, (_, sourceIndex) => {
    let value = `other ${sourceIndex}`;
    let count = 1;
    if (sourceIndex === 0) {
      value = "target 0";
      count = 20;
    } else if (sourceIndex === 11) {
      value = "TARGET 11";
      count = 3;
    } else if (sourceIndex === 12) {
      value = "target 12";
      count = 100;
    }
    return { value, count };
  });
  const columns = [
    {
      key: "value",
      label: "Value",
      filterValue: { kind: "text", read: (row) => row.value },
      compare: (left, right) => left.value.localeCompare(right.value),
      renderCell: (row) => row.value,
    },
    {
      key: "count",
      label: "Count",
      filterValue: { kind: "text", read: (row) => String(row.count) },
      compare: (left, right) => left.count - right.count,
      renderCell: (row) => row.count,
    },
  ];
  const projection = projectSummaryRows(
    rows,
    columns,
    new Map([["value", { kind: "contains", value: "target" }]]),
    { key: "count", direction: "ascending" },
    2,
  );

  assert.equal(projection.matchedCount, 3);
  assert.deepEqual(
    projection.rows.map(({ row, sourceIndex }) => ({ count: row.count, sourceIndex })),
    [
      { count: 3, sourceIndex: 11 },
      { count: 20, sourceIndex: 0 },
    ],
  );
});

test("summary projection preserves original source indices and stable sort ties", async () => {
  const { projectSummaryRows } = await viteServer.ssrLoadModule(
    "/src/summaryTable.ts",
  );
  const rows = [
    { name: "First tie", score: 2 },
    { name: "Second tie", score: 2 },
    { name: "Earlier score", score: 1 },
  ];
  const columns = [
    {
      key: "score",
      label: "Score",
      filterValue: { kind: "text", read: (row) => String(row.score) },
      compare: (left, right) => left.score - right.score,
      renderCell: (row) => row.score,
    },
  ];
  const projection = projectSummaryRows(
    rows,
    columns,
    new Map(),
    { key: "score", direction: "ascending" },
    null,
  );

  assert.deepEqual(
    projection.rows.map(({ row, sourceIndex }) => ({ name: row.name, sourceIndex })),
    [
      { name: "Earlier score", sourceIndex: 2 },
      { name: "First tie", sourceIndex: 0 },
      { name: "Second tie", sourceIndex: 1 },
    ],
  );
});

test("pattern status sorts Missing before Present in ascending order", async () => {
  const { sortRows, comparePatternStatus } = await viteServer.ssrLoadModule(
    "/src/tableSorting.ts",
  );
  const rows = [{ status: "present" }, { status: "missing" }];

  assert.deepEqual(
    sortRows(rows, { key: "status", direction: "ascending" }, (_key, left, right) =>
      comparePatternStatus(left.status, right.status),
    ),
    [{ status: "missing" }, { status: "present" }],
  );
  assert.deepEqual(
    sortRows(rows, { key: "status", direction: "descending" }, (_key, left, right) =>
      comparePatternStatus(left.status, right.status),
    ),
    [{ status: "present" }, { status: "missing" }],
  );
});

test("text sorting is locale-aware and places null values first in ascending order", async () => {
  const { sortRows, compareNullableText } = await viteServer.ssrLoadModule(
    "/src/tableSorting.ts",
  );
  const rows = [
    { name: "Beta", value: "beta" },
    { name: "Missing", value: null },
    { name: "Alpha", value: "Alpha" },
  ];
  const compareByValue = (_key, left, right) =>
    compareNullableText(left.value, right.value);

  assert.deepEqual(
    sortRows(rows, { key: "value", direction: "ascending" }, compareByValue).map(
      (row) => row.name,
    ),
    ["Missing", "Alpha", "Beta"],
  );
  assert.deepEqual(
    sortRows(rows, { key: "value", direction: "descending" }, compareByValue).map(
      (row) => row.name,
    ),
    ["Beta", "Alpha", "Missing"],
  );
});

test("sortable headers sort from the visible column label without a sort icon", async () => {
  const { SortableHeader } = await viteServer.ssrLoadModule(
    "/src/SortableHeader.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(SortableHeader, {
      label: "Input Rows",
      sortKey: "count",
      sortState: { key: "count", direction: "ascending" },
      onSort: () => {},
    }),
  );

  assert.match(markup, /<th[^>]*aria-sort="ascending"/);
  assert.match(
    markup,
    /<button[^>]*aria-label="Sort by Input Rows"[^>]*><span[^>]*>Input Rows<\/span><\/button>/,
  );
  assert.doesNotMatch(markup, /<svg/);
});
