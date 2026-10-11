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

function renderDialog(ColumnStatusRowsDialogView, overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(ColumnStatusRowsDialogView, {
      columnName: "email",
      status: "missing",
      matchingRowCount: 2,
      page: {
        columns: ["record_id", "email"],
        rows: [
          ["A1", null],
          ["A2", "<script>unsafe</script>"],
        ],
        page: 1,
        page_size: 50,
        total_rows: 2,
      },
      requestedPage: 1,
      filters: {},
      onFiltersChanged: () => {},
      loading: false,
      error: null,
      onPageChange: () => {},
      onRetry: () => {},
      exportLoading: false,
      exportError: null,
      exportSuccess: null,
      onExport: () => {},
      onClose: () => {},
      ...overrides,
    }),
  );
}

test("column-status details show matching source rows and an explicit export action", async () => {
  const { ColumnStatusRowsDialogView } = await viteServer.ssrLoadModule(
    "/src/ColumnStatusRowsDialog.tsx",
  );
  const markup = renderDialog(ColumnStatusRowsDialogView);

  assert.match(markup, /Input Rows where email is missing/);
  assert.match(markup, /2 Input Rows have a Missing Value in email/);
  assert.match(markup, /Download all matching rows as CSV/);
  assert.match(markup, /Page 1 of 1/);
  assert.match(markup, /Source columns and rows are shown in their original order/);
  assert.match(markup, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script\b/i);
  assert.doesNotMatch(markup, /Columns used in analysis/);
});

test("column-status details distinguish loading, empty, and retryable errors", async () => {
  const { ColumnStatusRowsDialogView } = await viteServer.ssrLoadModule(
    "/src/ColumnStatusRowsDialog.tsx",
  );
  const loadingMarkup = renderDialog(ColumnStatusRowsDialogView, {
    loading: true,
    page: null,
  });
  const emptyMarkup = renderDialog(ColumnStatusRowsDialogView, {
    page: {
      columns: ["email"],
      rows: [],
      page: 1,
      page_size: 50,
      total_rows: 0,
    },
  });
  const errorMarkup = renderDialog(ColumnStatusRowsDialogView, {
    loading: false,
    page: null,
    error: "The local API could not retrieve these Input Rows.",
  });

  assert.match(loadingMarkup, /Loading matching Input Rows/);
  assert.match(emptyMarkup, /No Input Rows were found for this column status/);
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /Retry loading rows/);
});
