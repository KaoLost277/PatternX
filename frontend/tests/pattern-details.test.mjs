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

function renderDetailsDialog(PatternRowsDialog, dialogProps) {
  return renderToStaticMarkup(React.createElement(PatternRowsDialog, dialogProps));
}

async function renderPatternDetails(dialogProps) {
  const { PatternRowsDialog } = await viteServer.ssrLoadModule(
    "/src/PatternRowsDialog.tsx",
  );
  return renderDetailsDialog(PatternRowsDialog, dialogProps);
}

function patternDetailsProps(overrides = {}) {
  return {
    patternCount: 0,
    analysisColumns: [],
    columnMode: "all",
    onColumnModeChange: () => {},
    filters: {},
    onFiltersChanged: () => {},
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
    ...overrides,
  };
}

test("the populated View rows panel contains a semantic table of every returned source cell", async () => {
  const { PatternRowsDialog } = await viteServer.ssrLoadModule(
    "/src/PatternRowsDialog.tsx",
  );
  const sourceColumns = ["record_id", "<script>source</script>", "unselected_source_column"];
  const hostileValue = "<img src=x onerror=alert(1)>";
  const markup = renderDetailsDialog(PatternRowsDialog, {
    patternCount: 2,
    analysisColumns: ["<script>source</script>"],
    columnMode: "all",
    onColumnModeChange: () => {},
    filters: {},
    onFiltersChanged: () => {},
    page: {
      columns: sourceColumns,
      rows: [
        ["same-id", hostileValue, null],
        ["same-id", "second row", ""],
      ],
      page: 1,
      page_size: 50,
      total_rows: 2,
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
  });

  assert.match(markup, /2 Input Rows/);
  assert.ok(markup.includes("record_id"));
  assert.ok(markup.includes("&lt;script&gt;source&lt;/script&gt;"));
  assert.match(markup, /same-id/);
  assert.match(markup, /second row/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /<script\b|<img\b/i);
  assert.match(markup, /unselected_source_column/);
  assert.equal((markup.match(/same-id/g) ?? []).length, 2);

  const sourceTableRegion = markup.match(
    /<div[^>]*role="region"[^>]*aria-label="Input Rows table\. Scroll to view additional columns or rows\."[^>]*>([\s\S]*?)<\/div>/,
  )?.[1];
  assert.ok(sourceTableRegion, "successful row details should expose a named source table region");
  assert.match(markup, /aria-label="Input Rows table\. Scroll to view additional columns or rows\."[^>]*tabindex="0"/);
  assert.match(sourceTableRegion, /<table\b/);
  assert.match(sourceTableRegion, /<thead>[\s\S]*?<th[^>]*scope="col"/);
  assert.match(sourceTableRegion, /<tbody>[\s\S]*?<td/);
  assert.equal((sourceTableRegion.match(/<th\b/g) ?? []).length, sourceColumns.length);
  assert.equal((sourceTableRegion.match(/<tr\b/g) ?? []).length, 3);
  assert.equal((sourceTableRegion.match(/<td\b/g) ?? []).length, 6);
  assert.match(sourceTableRegion, /record_id[\s\S]*?&lt;script&gt;source&lt;\/script&gt;[\s\S]*?unselected_source_column/);
  assert.doesNotMatch(markup, /Loading Input Rows for this pattern|role="alert"/);

  const firstHostileHeaderPosition = markup.indexOf("&lt;script&gt;source&lt;/script&gt;");
  assert.ok(markup.indexOf("record_id") < firstHostileHeaderPosition);
  assert.ok(firstHostileHeaderPosition < markup.indexOf("unselected_source_column"));
  assert.ok(markup.indexOf("&lt;img") < markup.indexOf("second row"));
  assert.match(markup, /All source columns/);
  assert.match(markup, /Columns used in analysis/);
});

test("Input Row column headers expose active filters and editable filter chips", async () => {
  const markup = await renderPatternDetails(
    patternDetailsProps({
      patternCount: 3,
      filters: {
        email: { kind: "contains", value: "ADA" },
        notes: { kind: "missing" },
      },
      page: {
        columns: ["email", "phone"],
        rows: [["ada@example.com", "555-0100"]],
        page: 1,
        page_size: 50,
        total_rows: 1,
      },
    }),
  );

  assert.match(markup, /1 of 3 Input Rows match the current filters\./);
  assert.match(markup, /aria-label="Filter email"[^>]*aria-expanded="false" aria-pressed="true"/);
  assert.match(markup, /aria-label="Edit filter for notes: Missing Value"/);
  assert.match(markup, /notes: Missing Value/);
  assert.match(markup, /Clear all filters/);
  assert.match(markup, /aria-label="Match type for column"/);
  assert.match(markup, /Apply filter/);
});

test("headers named after object properties start without an active filter", async () => {
  const markup = await renderPatternDetails(
    patternDetailsProps({
      patternCount: 1,
      page: {
        columns: ["constructor", "__proto__"],
        rows: [["value", "other"]],
        page: 1,
        page_size: 50,
        total_rows: 1,
      },
    }),
  );

  assert.match(markup, /aria-label="Filter constructor"[^>]*aria-pressed="false"/);
  assert.match(markup, /aria-label="Filter __proto__"[^>]*aria-pressed="false"/);
  assert.doesNotMatch(markup, /column filter is active|column filters are active/);
});

test("pattern details show analysis columns in source order without the Identifier Column", async () => {
  const markup = await renderPatternDetails(
    patternDetailsProps({
      patternCount: 1,
      columnMode: "analysis",
      analysisColumns: ["phone", "email"],
      page: {
        columns: ["record_id", "email", "phone", "notes"],
        rows: [["A1", "ada@example.com", "555-0100", "row note"]],
        page: 1,
        page_size: 50,
        total_rows: 1,
      },
    }),
  );
  const tableRegion = markup.match(
    /<div[^>]*role="region"[^>]*aria-label="Input Rows table\. Scroll to view additional columns or rows\."[^>]*>([\s\S]*?)<\/div>/,
  )?.[1];

  assert.ok(tableRegion);
  assert.match(tableRegion, /aria-label="Filter email"[\s\S]*?aria-label="Filter phone"/);
  assert.match(tableRegion, /<td[^>]*><span[^>]*>ada@example\.com<\/span><\/td>/);
  assert.match(tableRegion, /<td[^>]*><span[^>]*>555-0100<\/span><\/td>/);
  assert.doesNotMatch(tableRegion, /record_id|A1|notes|row note/);
  assert.equal((tableRegion.match(/<th\b/g) ?? []).length, 2);
  assert.equal((tableRegion.match(/<td\b/g) ?? []).length, 2);
});

test("pattern details fall back to all source columns if the analysis set has no match", async () => {
  const markup = await renderPatternDetails(
    patternDetailsProps({
      patternCount: 1,
      columnMode: "analysis",
      analysisColumns: ["missing-analysis-column"],
      page: {
        columns: ["record_id", "source_value"],
        rows: [["A1", "present"]],
        page: 1,
        page_size: 50,
        total_rows: 1,
      },
    }),
  );
  const tableRegion = markup.match(
    /<div[^>]*role="region"[^>]*aria-label="Input Rows table\. Scroll to view additional columns or rows\."[^>]*>([\s\S]*?)<\/div>/,
  )?.[1];

  assert.ok(tableRegion);
  assert.match(tableRegion, /record_id[\s\S]*?source_value/);
  assert.equal((tableRegion.match(/<th\b/g) ?? []).length, 2);
});

test("visible-row projection filters headers and cells together in source order", async () => {
  const { projectVisibleRows } = await viteServer.ssrLoadModule(
    "/src/rowColumnMode.ts",
  );

  assert.deepEqual(
    projectVisibleRows(
      ["record_id", "email", "phone", "notes"],
      [["A1", "ada@example.com", "555-0100", "first"]],
      ["phone", "email"],
      "analysis",
    ),
    {
      columns: ["email", "phone"],
      rows: [["ada@example.com", "555-0100"]],
    },
  );
});

test("pattern row requests use the job and canonical pattern index with the selected page", async () => {
  const { fetchPatternRowsPage } = await viteServer.ssrLoadModule("/src/patternRows.ts");
  const previousFetch = globalThis.fetch;
  const requestSignal = new AbortController().signal;
  const filters = { notes: { kind: "contains", value: "A&B" } };
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
    const page = await fetchPatternRowsPage("job-123", 4, 2, requestSignal, filters);

    const requestParameters = new URLSearchParams(requestedUrl.split("?")[1]);
    assert.equal(
      requestedUrl.split("?")[0],
      "/api/analysis-jobs/job-123/patterns/4/rows",
    );
    assert.equal(requestParameters.get("page"), "2");
    assert.equal(requestParameters.get("filters"), JSON.stringify(filters));
    assert.equal(requestedSignal, requestSignal);
    assert.equal(page.page, 2);
    assert.equal(page.total_rows, 51);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("pattern row request failures return the API's readable error", async () => {
  const { fetchPatternRowsPage } = await viteServer.ssrLoadModule("/src/patternRows.ts");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ detail: "The row details are no longer available." }),
  });

  try {
    await assert.rejects(
      fetchPatternRowsPage("job-123", 0, 1, new AbortController().signal),
      /The row details are no longer available\./,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("pattern CSV downloads request the canonical pattern and provide a practical filename", async () => {
  const { downloadPatternRowsCsv } = await viteServer.ssrLoadModule("/src/patternRows.ts");
  const previousFetch = globalThis.fetch;
  const previousDocument = globalThis.document;
  const previousCreateObjectURL = URL.createObjectURL;
  const previousRevokeObjectURL = URL.revokeObjectURL;
  let requestedUrl = "";
  let appendedLink = null;
  let revokedUrl = "";
  const downloadLink = {
    href: "",
    download: "",
    hidden: false,
    clicked: false,
    removed: false,
    click() {
      this.clicked = true;
    },
    remove() {
      this.removed = true;
    },
  };

  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return { ok: true, blob: async () => new Blob(["csv content"]) };
  };
  globalThis.document = {
    createElement: (tagName) => {
      assert.equal(tagName, "a");
      return downloadLink;
    },
    body: {
      append: (link) => {
        appendedLink = link;
      },
    },
  };
  URL.createObjectURL = () => "blob:pattern-export";
  URL.revokeObjectURL = (url) => {
    revokedUrl = url;
  };

  try {
    const filters = { notes: { kind: "exact", value: "first & second" } };
    await downloadPatternRowsCsv("job /id", 5, "all", filters);

    const requestUrl = new URL(requestedUrl, "http://localhost");
    assert.equal(requestUrl.pathname, "/api/analysis-jobs/job%20%2Fid/patterns/5/exports/rows.csv");
    assert.equal(requestUrl.searchParams.get("filters"), JSON.stringify(filters));
    assert.equal(appendedLink, downloadLink);
    assert.equal(downloadLink.download, "pattern_rows_6.csv");
    assert.equal(downloadLink.clicked, true);
    assert.equal(downloadLink.removed, true);
    assert.equal(revokedUrl, "blob:pattern-export");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
    URL.createObjectURL = previousCreateObjectURL;
    URL.revokeObjectURL = previousRevokeObjectURL;
  }
});

test("pattern CSV exports preserve column mode and row filters", async () => {
  const { downloadPatternRowsCsv } = await viteServer.ssrLoadModule("/src/patternRows.ts");
  const previousFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = url;
    return {
      ok: false,
      json: async () => ({ detail: "Expected export failure for request inspection." }),
    };
  };

  try {
    const filters = { notes: { kind: "missing" } };
    await assert.rejects(
      downloadPatternRowsCsv("job-123", 4, "analysis", filters),
      /Expected export failure for request inspection\./,
    );
    const requestUrl = new URL(requestedUrl, "http://localhost");
    assert.equal(requestUrl.pathname, "/api/analysis-jobs/job-123/patterns/4/exports/rows.csv");
    assert.equal(requestUrl.searchParams.get("column_mode"), "analysis");
    assert.equal(requestUrl.searchParams.get("filters"), JSON.stringify(filters));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("pattern CSV download failures expose the API's readable message", async () => {
  const { downloadPatternRowsCsv } = await viteServer.ssrLoadModule("/src/patternRows.ts");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    json: async () => ({ detail: "Pattern rows are no longer available." }),
  });

  try {
    await assert.rejects(
      downloadPatternRowsCsv("job-123", 0),
      /Pattern rows are no longer available\./,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("pattern details distinguish loading, empty, and retrieval-error states", async () => {
  const loadingMarkup = await renderPatternDetails(
    patternDetailsProps({ patternCount: 1, loading: true }),
  );
  const emptyMarkup = await renderPatternDetails(
    patternDetailsProps({
      page: { columns: ["source"], rows: [], page: 1, page_size: 50, total_rows: 0 },
    }),
  );
  const errorMarkup = await renderPatternDetails(
    patternDetailsProps({ error: "The detail rows could not be read." }),
  );

  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /Loading Input Rows for this pattern/);
  assert.doesNotMatch(loadingMarkup, /<table/);
  assert.match(emptyMarkup, /No Input Rows were found/);
  assert.match(emptyMarkup, /Return to summary/);
  assert.doesNotMatch(emptyMarkup, /<table/);
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /The detail rows could not be read\./);
  assert.match(errorMarkup, /Retry loading rows/);
});

test("pattern details offer an accessible full-row CSV export and show retryable failures", async () => {
  const loadingMarkup = await renderPatternDetails(
    patternDetailsProps({ patternCount: 51, exportLoading: true }),
  );
  const markup = await renderPatternDetails(
    patternDetailsProps({
      patternCount: 51,
      exportError: "The CSV could not be downloaded. Check the local API and retry.",
    }),
  );

  const exportButton = markup.match(
    /<button[^>]*aria-label="Download all matching Input Rows as CSV"[^>]*>/,
  )?.[0];
  assert.ok(exportButton);
  assert.doesNotMatch(exportButton, /\sdisabled(?:=|>)/);
  assert.match(markup, /Download all matching rows as CSV/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /The CSV could not be downloaded\. Check the local API and retry\./);

  const loadingButton = loadingMarkup.match(
    /<button[^>]*aria-label="Preparing CSV download"[^>]*>/,
  )?.[0];
  assert.ok(loadingButton);
  assert.match(loadingButton, /disabled=""/);
  assert.match(loadingMarkup, /Preparing the full pattern export/);
});

test("pattern details announce when the CSV download starts", async () => {
  const markup = await renderPatternDetails(
    patternDetailsProps({ patternCount: 2, exportSuccess: "CSV download started." }),
  );

  assert.match(markup, /role="status"/);
  assert.match(markup, /CSV download started\./);
});

test("pattern details navigate 50-row pages and disable unavailable directions", async () => {
  const markup = await renderPatternDetails({
    ...patternDetailsProps({ patternCount: 51 }),
    page: {
      columns: ["source"],
      rows: [["last row"]],
      page: 1,
      page_size: 50,
      total_rows: 51,
    },
  });

  assert.match(markup, /Page 1 of 2/);
  assert.match(markup, /51 matching Input Rows/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Previous page<\/button>/);
  assert.match(markup, /<button[^>]*>Next page<\/button>/);

  const pageTwoMarkup = await renderPatternDetails({
    ...patternDetailsProps({ patternCount: 51, requestedPage: 2 }),
    page: {
      columns: ["source"],
      rows: [["row-51"]],
      page: 2,
      page_size: 50,
      total_rows: 51,
    },
  });

  assert.match(pageTwoMarkup, /Page 2 of 2/);
  assert.match(pageTwoMarkup, /<button[^>]*>Previous page<\/button>/);
  assert.match(pageTwoMarkup, /<button[^>]*disabled=""[^>]*>Next page<\/button>/);
  assert.match(pageTwoMarkup, /row-51/);
});

test("pattern details render all 50 rows returned for one page", async () => {
  const rows = Array.from({ length: 50 }, (_, rowIndex) => [`row-${rowIndex + 1}`]);
  const markup = await renderPatternDetails({
    ...patternDetailsProps({ patternCount: 51 }),
    page: {
      columns: ["record_id"],
      rows,
      page: 1,
      page_size: 50,
      total_rows: 51,
    },
  });

  assert.equal((markup.match(/<tr/g) ?? []).length, 51);
  assert.match(markup, /row-1/);
  assert.match(markup, /row-50/);
  assert.doesNotMatch(markup, /row-51/);
});
