import assert from "node:assert/strict";
import { File } from "node:buffer";
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

test("contract JSON round-trips supported ordered rules", async () => {
  const {
    parseDataContractJson,
    serializeDataContract,
  } = await viteServer.ssrLoadModule("/src/dataContract.ts");
  const contract = {
    version: 1,
    rules: [
      { column: "Email", kind: "required" },
      { column: "Status", kind: "enum", values: ["Active", "Inactive"] },
      { column: "Age", kind: "type", value_type: "integer" },
      {
        column: "Start Date",
        kind: "type",
        value_type: "date",
        date_format: "YYYY-MM-DD HH:MM:SS",
      },
    ],
  };

  assert.deepEqual(parseDataContractJson(serializeDataContract(contract)), contract);
});

test("contract parser rejects unsupported versions, fields, and rule definitions", async () => {
  const { parseDataContractJson } = await viteServer.ssrLoadModule(
    "/src/dataContract.ts",
  );
  const invalidContracts = [
    '{"version":2,"rules":[{"column":"Email","kind":"required"}]}',
    '{"version":true,"rules":[{"column":"Email","kind":"required"}]}',
    '{"version":1,"rules":[]}',
    '{"version":1,"extra":true,"rules":[{"column":"Email","kind":"required"}]}',
    '{"version":1,"rules":[{"column":"Email","kind":"required","extra":true}]}',
    '{"version":1,"rules":[{"column":"Status","kind":"enum","values":[]}]}',
    '{"version":1,"rules":[{"column":"Status","kind":"enum","values":[" "]}]}',
    '{"version":1,"rules":[{"column":"Age","kind":"type","value_type":"string"}]}',
    '{"version":1,"rules":[{"column":"Age","kind":"type","value_type":"date","date_format":"MM/DD/YYYY"}]}',
  ];

  for (const contractJson of invalidContracts) {
    assert.throws(() => parseDataContractJson(contractJson), Error);
  }
});

test("column issues use exact normalized names and report ambiguous matches", async () => {
  const { getDataContractColumnIssues } = await viteServer.ssrLoadModule(
    "/src/dataContract.ts",
  );
  const contract = {
    version: 1,
    rules: [
      { column: "Status", kind: "required" },
      { column: "Email", kind: "required" },
    ],
  };

  assert.deepEqual(
    getDataContractColumnIssues(contract, ["Status", "Status_1"]),
    ['Column "Email" is not present in the selected file.'],
  );
  assert.deepEqual(
    getDataContractColumnIssues(contract, ["Status", "Status", "Email"]),
    ['Column "Status" matches more than one column in the selected file.'],
  );
});

test("contract job API sends the selected file, applied markers, and versioned JSON", async () => {
  const {
    startDataContractJob,
  } = await viteServer.ssrLoadModule("/src/dataAnalysisApi.ts");
  const previousFetch = globalThis.fetch;
  let requestedUrl;
  let requestOptions;
  const expectedStatus = {
    job_id: "contract-job",
    analysis_kind: "data_contract",
    state: "running",
  };
  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => expectedStatus,
    };
  };

  try {
    const contract = {
      version: 1,
      rules: [{ column: "Status", kind: "required" }],
    };
    const status = await startDataContractJob(
      new File(["Status\nActive\n"], "customers.csv", { type: "text/csv" }),
      "Customers",
      { Status: ["N/A"] },
      contract,
    );

    assert.equal(requestedUrl, "/api/data-contract-jobs");
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.body.get("file").name, "customers.csv");
    assert.equal(requestOptions.body.get("sheet"), "Customers");
    assert.equal(requestOptions.body.get("missing_markers"), '{"Status":["N/A"]}');
    assert.equal(requestOptions.body.get("contract_json"), JSON.stringify(contract));
    assert.equal(status.job_id, "contract-job");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("contract polling and cancellation use the contract job routes", async () => {
  const {
    cancelDataContractJob,
    fetchDataContractJobStatus,
  } = await viteServer.ssrLoadModule("/src/dataAnalysisApi.ts");
  const previousFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, method: options.method ?? "GET" });
    return {
      ok: true,
      json: async () => ({
        job_id: "contract/job",
        analysis_kind: "data_contract",
        state: "running",
      }),
    };
  };

  try {
    await fetchDataContractJobStatus("contract/job");
    await cancelDataContractJob("contract/job");
    assert.deepEqual(requests, [
      { url: "/api/data-contract-jobs/contract%2Fjob", method: "GET" },
      { url: "/api/data-contract-jobs/contract%2Fjob/cancel", method: "POST" },
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("data contract panel presents the one-page rule builder and aggregate results", async () => {
  const { DataContractPanel } = await viteServer.ssrLoadModule(
    "/src/DataContractPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(DataContractPanel, {
      selectedFile: new File(["Status\nActive\n"], "customers.csv"),
      worksheetName: "Customers",
      columnNames: ["Status", "Age"],
      missingValueMarkers: { Status: ["N/A"] },
      datasetVersion: 1,
      hidden: false,
      onJobStatusChanged: () => {},
      onAnalysisStartingChanged: () => {},
      onError: () => {},
    }),
  );

  assert.match(markup, /Data Contracts/);
  assert.match(markup, /applied Missing Value settings/);
  assert.match(markup, /Add a rule/);
  assert.match(markup, /id="contract-column"/);
  assert.match(markup, /id="contract-rule-kind"/);
  assert.match(markup, /Contract rules/);
  assert.match(markup, /Import JSON/);
  assert.match(markup, /Export JSON/);
  assert.match(markup, /Run contract/);
  assert.match(markup, /Results/);
  assert.match(markup, /aggregate counts/);
});

test("contract results show exact counts and never show failing row values", async () => {
  const { DataContractResults } = await viteServer.ssrLoadModule(
    "/src/DataContractPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(DataContractResults, {
      rules: [
        { column: "Email", kind: "required" },
        { column: "Status", kind: "enum", values: ["Active", "Inactive"] },
      ],
      summary: {
        kind: "data_contract",
        input_rows: 3,
        rules: [
          {
            rule_index: 0,
            missing_count: 1,
            passing_count: 2,
            failing_count: 1,
          },
          {
            rule_index: 1,
            missing_count: 0,
            passing_count: 2,
            failing_count: 1,
          },
        ],
      },
    }),
  );

  assert.match(markup, /For Required rules, missing Input Rows also count as failures/);
  assert.match(markup, /Missing Input Rows/);
  assert.match(markup, /Passing Input Rows/);
  assert.match(markup, /Failing Input Rows/);
  assert.match(markup, /Email · Required<\/th><td>1<\/td><td>2<\/td><td>1<\/td>/);
  assert.match(
    markup,
    /Status · Allowed values: &quot;Active&quot;, &quot;Inactive&quot;<\/th><td>0<\/td><td>2<\/td><td>1<\/td>/,
  );
  assert.match(markup, /3 Input Rows · 2 rules/);
  assert.match(markup, /do not display or export failing row values/);
  assert.doesNotMatch(markup, /private-cell-value/);
});

test("contract enum values render as text instead of markup", async () => {
  const { DataContractResults } = await viteServer.ssrLoadModule(
    "/src/DataContractPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(DataContractResults, {
      rules: [
        {
          column: "Status",
          kind: "enum",
          values: ['<img src=x onerror="alert(1)">'],
        },
      ],
      summary: {
        kind: "data_contract",
        input_rows: 1,
        rules: [
          { rule_index: 0, missing_count: 0, passing_count: 0, failing_count: 1 },
        ],
      },
    }),
  );

  assert.match(markup, /&lt;img src=x onerror=/);
  assert.doesNotMatch(markup, /<img\b/i);
});
