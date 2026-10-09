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

test("hostile preview headers and cell values render as text", async () => {
  const { PatternPreview } = await viteServer.ssrLoadModule("/src/PatternPreview.tsx");
  const hostileHeader = "<script>alert(1)</script>";
  const hostileIdentifier = "<svg onload=alert(1)>";
  const hostileCell = "<img src=x onerror=alert(1)>";
  const patternSummary = {
    input_rows: 1,
    identifier_column: "record_id",
    analysis_columns: [hostileHeader],
    patterns: [],
  };
  const pattern = {
    statuses: ["present"],
    count: 1,
    share: 1,
    preview_rows: [
      {
        identifier_value: hostileIdentifier,
        values: [hostileCell],
      },
    ],
  };

  const markup = renderToStaticMarkup(
    React.createElement(PatternPreview, {
      patternSummary,
      pattern,
      visibleAnalysisColumns: patternSummary.analysis_columns,
    }),
  );

  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(markup, /&lt;svg onload=alert\(1\)&gt;/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /<script\b|<img\b|<svg\s+onload=/i);
});

test("preview displays only visible analysis columns and retains its identifier", async () => {
  const { PatternPreview } = await viteServer.ssrLoadModule("/src/PatternPreview.tsx");
  const patternSummary = {
    input_rows: 1,
    identifier_column: "record_id",
    analysis_columns: ["hidden_column", "visible_column"],
    patterns: [],
  };
  const pattern = {
    statuses: ["present", "missing"],
    count: 1,
    share: 1,
    preview_rows: [
      {
        identifier_value: "row-1",
        values: ["hidden value", "visible value"],
      },
    ],
  };

  const markup = renderToStaticMarkup(
    React.createElement(PatternPreview, {
      patternSummary,
      pattern,
      visibleAnalysisColumns: ["visible_column"],
    }),
  );

  assert.match(markup, /record_id/);
  assert.match(markup, /visible_column/);
  assert.match(markup, /visible value/);
  assert.doesNotMatch(markup, /hidden_column|hidden value/);
});
