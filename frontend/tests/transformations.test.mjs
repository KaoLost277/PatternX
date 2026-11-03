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

test("data transformations serializes and parses JSON contracts correctly", async () => {
  const { serializeTransformations, parseTransformationsJson } =
    await viteServer.ssrLoadModule("/src/dataTransformations.ts");

  const rules = [
    {
      id: "rule_1",
      source_column: "created_at",
      target_mode: "new_column",
      target_column: "date_only",
      transform_type: "date_truncate",
      config: { part: "date_only", delimiter: ":" },
    },
    {
      id: "rule_2",
      source_column: "code",
      target_mode: "overwrite",
      target_column: "code",
      transform_type: "delimiter_split",
      config: { delimiter: "_", position: "after" },
    },
  ];

  const jsonStr = serializeTransformations(rules);
  const parsed = parseTransformationsJson(jsonStr);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].source_column, "created_at");
  assert.equal(parsed[0].target_column, "date_only");
  assert.equal(parsed[0].transform_type, "date_truncate");
  assert.equal(parsed[1].source_column, "code");
  assert.equal(parsed[1].target_mode, "overwrite");
});

test("data transformation panel renders presets, rule builder and export actions", async () => {
  const { DataTransformationPanel } = await viteServer.ssrLoadModule(
    "/src/DataTransformationPanel.tsx",
  );

  const markup = renderToStaticMarkup(
    React.createElement(DataTransformationPanel, {
      selectedFile: new File(["id,date,code\n1,13/06/26:23:30:32,ADWD_1\n"], "test.csv"),
      worksheetName: "",
      columnNames: ["id", "date", "code"],
      hidden: false,
      onApplyDataset: async () => {},
    }),
  );

  assert.match(markup, /Data Transformations/);
  assert.match(markup, /Define a Transformation/);
  assert.match(markup, /Cut Time from Date/);
  assert.match(markup, /Extract after &#39;_&#39;|Extract after '_'|Extract after/);
  assert.match(markup, /Create New Virtual Column/);
  assert.match(markup, /Overwrite In-Place/);
  assert.match(markup, /Live Before \/ After Preview/);
  assert.match(markup, /Export CSV/);
  assert.match(markup, /Apply to Analysis/);
});

test("analysis mode tabs include Data Transformations tab", async () => {
  const { AnalysisModeTabs } = await viteServer.ssrLoadModule(
    "/src/AnalysisModeTabs.tsx",
  );

  const markup = renderToStaticMarkup(
    React.createElement(AnalysisModeTabs, {
      selectedMode: "transformations",
      enabled: true,
      onSelect: () => {},
    }),
  );

  assert.match(markup, /Data Transformations/);
  assert.match(markup, /id="analysis-tab-transformations"/);
  assert.match(markup, /aria-selected="true"/);
});
