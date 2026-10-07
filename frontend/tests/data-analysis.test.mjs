import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { after, test } from "node:test";
import { createServer } from "vite";

const viteServer = await createServer({
  configFile: "vite.config.ts",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
});

const appStyles = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");

after(async () => {
  await viteServer.close();
});

test("Group Data mode renders explicit selected-column controls", async () => {
  const { DataAnalysisPanel } = await viteServer.ssrLoadModule("/src/DataAnalysisPanel.tsx");
  const markup = renderToStaticMarkup(
    React.createElement(DataAnalysisPanel, {
      analysisKind: "group_data",
      selectedFile: { name: "employees.csv" },
      worksheetName: "",
      columnNames: ["Department", "Approval_Status"],
      missingValueMarkers: {},
      hidden: false,
      onJobStatusChanged: () => {},
      onAnalysisStartingChanged: () => {},
      onError: () => {},
    }),
  );

  assert.match(markup, /Group Data Setup/);
  assert.match(markup, /Columns to analyze/);
  assert.match(markup, /Department/);
  assert.match(markup, /Approval_Status/);
  assert.match(markup, /Analyze Group Data/);
  assert.match(markup, /Every Input Row is grouped by the observed combination/);
});

test("the top navigation shows the app title and disables mode selection before import", async () => {
  const { default: App } = await viteServer.ssrLoadModule("/src/App.tsx");
  const markup = renderToStaticMarkup(React.createElement(App));

  assert.match(markup, /class="top-navbar"/);
  assert.match(markup, /<h1 class="navbar-app-name">PatternX Data Profiler<\/h1>/);
  assert.match(markup, /aria-label="Analysis menu"[^>]*disabled=""/);
  assert.match(markup, /No file loaded/);
  assert.doesNotMatch(markup, /class="analysis-mode-cards"/);
});

test("the hamburger navigation is sticky and opens from the left side", () => {
  assert.match(appStyles, /\.top-navbar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*10;/s);
  assert.match(appStyles, /\.analysis-mode-navigation\s*\{[^}]*position:\s*absolute;[^}]*left:\s*0;/s);
});

test("data-analysis row details render source values as inert text", async () => {
  const { DataAnalysisRowsDialog } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisRowsDialog.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(DataAnalysisRowsDialog, {
      title: "Rows for a term",
      targetDescription: 'the term "<script>unsafe</script>"',
      matchingRowCount: 1,
      page: {
        columns: ["<img src=x onerror=alert(1)>", "value"],
        rows: [["<script>unsafe</script>", "safe"]],
        page: 1,
        page_size: 50,
        total_rows: 1,
      },
      requestedPage: 1,
      loading: false,
      error: null,
      onPageChange: () => {},
      onRetry: () => {},
      exportLoading: false,
      exportError: null,
      exportSuccess: null,
      onExport: () => {},
      onClose: () => {},
    }),
  );

  assert.match(markup, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /<script\b|<img\b/i);
  assert.match(markup, /Download all matching rows as CSV/);
  assert.match(markup, /Page 1 of 1/);
});

test("data-analysis row requests include the selected result target and page", async () => {
  const { fetchDataAnalysisRowsPage } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
  const previousFetch = globalThis.fetch;
  const requestSignal = new AbortController().signal;
  let requestedUrl = "";
  let requestedSignal;
  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    requestedSignal = options.signal;
    return {
      ok: true,
      json: async () => ({
        columns: ["source_column"],
        rows: [["value"]],
        page: 2,
        page_size: 50,
        total_rows: 51,
      }),
    };
  };

  try {
    const page = await fetchDataAnalysisRowsPage(
      "job-123",
      { kind: "term", columnIndex: 1, itemIndex: 4 },
      2,
      requestSignal,
    );

    assert.equal(
      requestedUrl,
      "/api/data-analysis-jobs/job-123/rows?target_kind=term&item_index=4&column_index=1&page=2",
    );
    assert.equal(requestedSignal, requestSignal);
    assert.equal(page.page, 2);
    assert.equal(page.total_rows, 51);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
