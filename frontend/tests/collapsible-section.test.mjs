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

test("section shows its title, summary, and content in a native disclosure", async () => {
  const { CollapsibleSection } = await viteServer.ssrLoadModule(
    "/src/CollapsibleSection.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(
      CollapsibleSection,
      {
        title: "Column Completeness Summary",
        summary: "500 rows · 4 columns",
        open: true,
        onOpenChange: () => {},
      },
      React.createElement("p", null, "Column completeness details"),
    ),
  );

  assert.match(markup, /<details[^>]*\bopen=/);
  assert.match(markup, /<summary[^>]*>.*Column Completeness Summary.*500 rows · 4 columns.*<\/summary>/);
  assert.match(markup, /<p>Column completeness details<\/p>/);
});

test("section content remains available when the disclosure starts collapsed", async () => {
  const { CollapsibleSection } = await viteServer.ssrLoadModule(
    "/src/CollapsibleSection.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(
      CollapsibleSection,
      {
        title: "Pattern results",
        summary: "8 patterns",
        open: false,
        onOpenChange: () => {},
      },
      React.createElement("p", null, "Pattern table"),
    ),
  );

  assert.match(markup, /<details(?:\s[^>]*)?>/);
  assert.doesNotMatch(markup, /<details[^>]*\bopen=/);
  assert.match(markup, /<summary[^>]*>.*Pattern results.*8 patterns.*<\/summary>/);
  assert.match(markup, /<p>Pattern table<\/p>/);
});

test("the shared dataset context and file picker appear on the initial app view", async () => {
  const { default: App } = await viteServer.ssrLoadModule("/src/App.tsx");
  const markup = renderToStaticMarkup(React.createElement(App));

  assert.match(
    markup,
    /<section[^>]*aria-labelledby="shared-context-heading"/,
  );
  assert.match(markup, /<h2 id="shared-context-heading"[^>]*>Shared data context<\/h2>/);
  assert.match(markup, /<label[^>]*><span>CSV or XLSX file<\/span>/);
  assert.match(markup, /<summary[^>]*>.*Missing Value settings/);
});
