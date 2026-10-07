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

const patternRowsDialogStyles = readFileSync(
  new URL("../src/PatternRowsDialog.css", import.meta.url),
  "utf8",
);

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

  const previewPanel = markup.match(
    /<div class="preview-panel">([\s\S]*?)<\/div>\s*<\/div>/,
  )?.[1];
  assert.ok(previewPanel, "successful row details should render the populated preview panel");
  assert.match(previewPanel, /<table\b[^>]*class="summary-table preview-table(?:\s|")/);
  assert.match(previewPanel, /<thead>[\s\S]*?<th[^>]*scope="col"/);
  assert.match(previewPanel, /<tbody>[\s\S]*?<td/);
  assert.equal((previewPanel.match(/<th\b/g) ?? []).length, sourceColumns.length);
  assert.equal((previewPanel.match(/<tr\b/g) ?? []).length, 3);
  assert.equal((previewPanel.match(/<td\b/g) ?? []).length, 6);
  assert.match(previewPanel, /record_id[\s\S]*?&lt;script&gt;source&lt;\/script&gt;[\s\S]*?unselected_source_column/);
  assert.doesNotMatch(markup, /Loading Input Rows for this pattern|role="alert"/);

  const firstHostileHeaderPosition = markup.indexOf("&lt;script&gt;source&lt;/script&gt;");
  assert.ok(markup.indexOf("record_id") < firstHostileHeaderPosition);
  assert.ok(firstHostileHeaderPosition < markup.indexOf("unselected_source_column"));
  assert.ok(markup.indexOf("&lt;img") < markup.indexOf("second row"));
});

test("the row details table keeps source columns readable and scrolls horizontally", () => {
  assert.match(
    patternRowsDialogStyles,
    /\.pattern-rows-dialog \.preview-table-frame\s*\{[^}]*overflow:\s*auto;/s,
  );
  assert.match(
    patternRowsDialogStyles,
    /\.pattern-rows-table\s*\{[^}]*width:\s*auto;[^}]*min-width:\s*100%;/s,
  );
  assert.match(
    patternRowsDialogStyles,
    /\.pattern-rows-table th,\s*\.pattern-rows-table td\s*\{[^}]*min-width:\s*8rem;/s,
  );
});

test("pattern row requests use the job and canonical pattern index with the selected page", async () => {
  const { fetchPatternRowsPage } = await viteServer.ssrLoadModule("/src/patternRows.ts");
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
    const page = await fetchPatternRowsPage("job-123", 4, 2, requestSignal);

    assert.equal(requestedUrl, "/api/analysis-jobs/job-123/patterns/4/rows?page=2");
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
    await downloadPatternRowsCsv("job /id", 5);

    assert.equal(
      requestedUrl,
      "/api/analysis-jobs/job%20%2Fid/patterns/5/exports/rows.csv",
    );
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
  assert.doesNotMatch(exportButton, /disabled/);
  assert.match(markup, /Download all matching rows as CSV/);
  assert.match(markup, /role="alert"/);
  assert.match(markup, /The CSV could not be downloaded\. Check the local API and retry\./);

  const loadingButton = loadingMarkup.match(
    /<button[^>]*aria-label="Download all matching Input Rows as CSV"[^>]*>/,
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
