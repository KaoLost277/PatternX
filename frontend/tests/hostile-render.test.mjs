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
    React.createElement(PatternPreview, { patternSummary, pattern }),
  );

  assert.match(markup, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(markup, /&lt;svg onload=alert\(1\)&gt;/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /<script\b|<svg\b|<img\b/i);
});
