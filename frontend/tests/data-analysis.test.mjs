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

test("Group Data Summary identifies its selected columns and observed groups", async () => {
  const { GroupDataResults } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(GroupDataResults, {
      summary: {
        kind: "group_data",
        input_rows: 3,
        selected_columns: ["Department", "Approval_Status"],
        groups: [
          { values: ["Sales", "Approved"], count: 2, share: 2 / 3 },
          { values: ["Operations", null], count: 1, share: 1 / 3 },
        ],
      },
      showAllGroups: false,
      onShowAllGroups: () => {},
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );

  assert.match(markup, /Group Data Summary/);
  assert.match(markup, /Groups are defined by values in these selected columns:/);
  assert.match(markup, /Department, Approval_Status/);
  assert.match(markup, /Sales/);
  assert.match(markup, /Approved/);
  assert.match(markup, /Operations/);
  assert.match(markup, /Input Rows/);
  assert.match(markup, /Share/);
  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(
    markup,
    /aria-label="View Input Rows for the group Department=Sales, Approval_Status=Approved"/,
  );
});

test("Formal Terms Summary retains terms, structural formats, and row-detail actions", async () => {
  const { FormalTermsResults } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(FormalTermsResults, {
      summary: {
        kind: "formal_terms",
        input_rows: 4,
        selected_columns: ["Employee_Code"],
        columns: [
          {
            name: "Employee_Code",
            terms: [{ value: "EMP-0001", count: 2, share: 0.5 }],
            format_patterns: [
              {
                pattern: "EMP-<4 digits>",
                occurrence_count: 3,
                distinct_term_count: 2,
                share: 0.75,
              },
            ],
          },
        ],
      },
      showAllTerms: {},
      onShowAllTerms: () => {},
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );

  assert.match(markup, /Formal Terms Summary/);
  assert.match(markup, /Employee_Code/);
  assert.match(markup, /EMP-0001/);
  assert.match(markup, /Structural Format Patterns/);
  assert.match(markup, /EMP-&lt;4 digits&gt;/);
  assert.match(markup, /3/);
  assert.match(markup, /Distinct terms/);
  assert.equal((markup.match(/aria-haspopup="dialog"/g) ?? []).length, 2);
  assert.match(markup, /aria-label="View Input Rows for the term &quot;EMP-0001&quot;"/);
  assert.match(markup, /aria-label="View Input Rows for the format &quot;EMP-&lt;4 digits&gt;&quot;"/);
});

test("Formal Terms and Group Data render hostile headers and values as inert text", async () => {
  const { FormalTermsResults, GroupDataResults } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisPanel.tsx",
  );
  const hostileHeader = "<img src=x onerror=alert(1)>";
  const hostileValue = "<script>unsafe</script>";
  const groupMarkup = renderToStaticMarkup(
    React.createElement(GroupDataResults, {
      summary: {
        kind: "group_data",
        input_rows: 1,
        selected_columns: [hostileHeader],
        groups: [{ values: [hostileValue], count: 1, share: 1 }],
      },
      showAllGroups: false,
      onShowAllGroups: () => {},
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );
  const formalTermsMarkup = renderToStaticMarkup(
    React.createElement(FormalTermsResults, {
      summary: {
        kind: "formal_terms",
        input_rows: 1,
        selected_columns: [hostileHeader],
        columns: [
          {
            name: hostileHeader,
            terms: [{ value: hostileValue, count: 1, share: 1 }],
            format_patterns: [],
          },
        ],
      },
      showAllTerms: {},
      onShowAllTerms: () => {},
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );

  for (const markup of [groupMarkup, formalTermsMarkup]) {
    assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(markup, /&lt;script&gt;unsafe&lt;\/script&gt;/);
    assert.doesNotMatch(markup, /<img\b|<script\b/i);
  }
});

test("the top navigation exposes all analysis modes as disabled tabs before import", async () => {
  const { default: App } = await viteServer.ssrLoadModule("/src/App.tsx");
  const markup = renderToStaticMarkup(React.createElement(App));

  assert.match(markup, /<h1[^>]*>PatternX Data Profiler<\/h1>/);
  assert.match(markup, /<nav[^>]*aria-label="Analysis modes"[^>]*role="tablist"/);
  for (const mode of ["Completeness Patterns", "Formal Terms", "Group Data"]) {
    const tabButtonPattern = new RegExp(
      `<button[^>]*role="tab"[^>]*disabled=""[^>]*>${mode}<\\/button>`,
    );
    assert.match(markup, tabButtonPattern);
  }
  for (const mode of ["completeness", "formal_terms", "group_data"]) {
    assert.match(markup, new RegExp(`aria-controls="analysis-panel-${mode}"`));
    assert.match(markup, new RegExp(`id="analysis-panel-${mode}"[^>]*role="tabpanel"`));
  }
  assert.match(markup, /No dataset loaded/);
});

test("the selected analysis tab exposes its active state", async () => {
  const { AnalysisModeTabs } = await viteServer.ssrLoadModule(
    "/src/AnalysisModeTabs.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(AnalysisModeTabs, {
      selectedMode: "formal_terms",
      enabled: true,
      onSelect: () => {},
    }),
  );

  assert.match(markup, /role="tablist"/);
  assert.match(markup, /<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>Formal Terms<\/button>/);
  assert.match(markup, /id="analysis-tab-formal_terms"/);
  assert.match(markup, /aria-controls="analysis-panel-formal_terms"/);
});

test("the shared dataset context keeps file, worksheet, and Missing Value controls together", async () => {
  const { default: App } = await viteServer.ssrLoadModule("/src/App.tsx");
  const markup = renderToStaticMarkup(React.createElement(App));

  assert.match(markup, /aria-labelledby="shared-context-heading"/);
  assert.match(markup, /CSV or XLSX file/);
  assert.match(markup, /Worksheet/);
  assert.match(markup, /<summary[^>]*>.*<span>Missing Value<\/span>/);
  assert.match(markup, /Import a file to configure Missing Value markers/);
});

test("the shared context identifies the active file, worksheet, and columns", async () => {
  const { SharedDatasetContextPanel } = await viteServer.ssrLoadModule(
    "/src/SharedDatasetContextPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(
      SharedDatasetContextPanel,
      {
        fileName: "quarterly & annual.xlsx",
        worksheetName: "Quarterly Summary",
        hasWorksheets: true,
        columnCount: 4,
      },
      React.createElement("p", null, "Shared Missing Value rules"),
    ),
  );

  assert.match(markup, /aria-labelledby="shared-context-heading"/);
  assert.match(markup, /quarterly &amp; annual\.xlsx/);
  assert.match(markup, /Quarterly Summary/);
  assert.match(markup, /4 columns/);
  assert.match(markup, /Shared Missing Value rules/);
});

test("the shared context does not show a worksheet as active before one is imported", async () => {
  const { SharedDatasetContextPanel } = await viteServer.ssrLoadModule(
    "/src/SharedDatasetContextPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(
      SharedDatasetContextPanel,
      {
        fileName: "quarterly.xlsx",
        worksheetName: "",
        hasWorksheets: true,
        columnCount: 0,
      },
      React.createElement("p", null, "Shared Missing Value rules"),
    ),
  );

  assert.match(markup, /quarterly\.xlsx/);
  assert.match(markup, /Choose a worksheet/);
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

test("shared data-analysis row details distinguish loading, empty, error, and export feedback", async () => {
  const { DataAnalysisRowsDialog } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisRowsDialog.tsx",
  );
  const baseProps = {
    title: "Rows for a Formal Term",
    targetDescription: 'the term "example"',
    matchingRowCount: 1,
    page: null,
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
  };
  const renderDialog = (overrides = {}) => {
    return renderToStaticMarkup(
      React.createElement(DataAnalysisRowsDialog, { ...baseProps, ...overrides }),
    );
  };

  const loadingMarkup = renderDialog({ loading: true });
  const emptyMarkup = renderDialog({
    page: { columns: ["source"], rows: [], page: 1, page_size: 50, total_rows: 0 },
  });
  const errorMarkup = renderDialog({ error: "The matching rows could not be retrieved." });
  const exportLoadingMarkup = renderDialog({ exportLoading: true });
  const exportErrorMarkup = renderDialog({ exportError: "The CSV could not be downloaded." });
  const exportSuccessMarkup = renderDialog({ exportSuccess: "CSV download started." });

  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /Loading matching Input Rows/);
  assert.doesNotMatch(loadingMarkup, /<table/);
  assert.match(emptyMarkup, /No Input Rows match/);
  assert.match(emptyMarkup, /Return to summary/);
  assert.doesNotMatch(emptyMarkup, /<table/);
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /The matching rows could not be retrieved\./);
  assert.match(errorMarkup, /Retry loading rows/);

  const exportButton = exportLoadingMarkup.match(
    /<button[^>]*aria-label="Download all matching Input Rows as CSV"[^>]*>/,
  )?.[0];
  assert.ok(exportButton);
  assert.match(exportButton, /\sdisabled=""/);
  assert.match(exportLoadingMarkup, /Preparing the full row export/);
  assert.match(exportErrorMarkup, /role="alert"/);
  assert.match(exportErrorMarkup, /The CSV could not be downloaded\./);
  assert.match(exportSuccessMarkup, /role="status"/);
  assert.match(exportSuccessMarkup, /CSV download started\./);
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
