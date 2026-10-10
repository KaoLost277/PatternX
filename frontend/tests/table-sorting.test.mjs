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

test("sortable headers expose their current direction and an accessible button", async () => {
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
  assert.match(markup, /<button[^>]*aria-label="Sort by Input Rows"/);
  assert.match(markup, /<span>Input Rows<\/span>/);
});
