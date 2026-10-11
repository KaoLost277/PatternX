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

function successfulColumnProfileStatus() {
  return {
    job_id: "profile-job-1",
    analysis_kind: "column_profile",
    state: "succeeded",
    stage: null,
    elapsed_seconds: 0.5,
    progress: { items_done: 2, items_total: 2 },
    result: {
      kind: "column_profile",
      input_rows: 4,
      columns: [
        {
          name: "Status",
          present: {
            count: 3,
            denominator: 4,
            denominator_kind: "input_rows",
            share: 0.75,
          },
          missing: {
            count: 1,
            denominator: 4,
            denominator_kind: "input_rows",
            share: 0.25,
          },
          distinct_terms: {
            count: 2,
            denominator: 3,
            denominator_kind: "present_values",
            share: 2 / 3,
          },
        },
        {
          name: "All missing",
          present: {
            count: 0,
            denominator: 4,
            denominator_kind: "input_rows",
            share: 0,
          },
          missing: {
            count: 4,
            denominator: 4,
            denominator_kind: "input_rows",
            share: 1,
          },
          distinct_terms: {
            count: 0,
            denominator: 0,
            denominator_kind: "present_values",
            share: null,
          },
        },
      ],
    },
    error: null,
  };
}

function collectElements(element, predicate, collected = []) {
  if (!React.isValidElement(element)) {
    return collected;
  }
  if (predicate(element)) {
    collected.push(element);
  }
  for (const child of React.Children.toArray(element.props.children)) {
    collectElements(child, predicate, collected);
  }
  return collected;
}

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
        key_uniqueness: {
          distinct_key_count: 2,
          singleton_key_count: 1,
          repeated_key_count: 1,
          input_rows_in_repeated_key_groups: 2,
          singleton_key_share: 0.5,
        },
        groups: [
          { values: ["Sales", "Approved"], count: 2, share: 2 / 3 },
          { values: ["Operations", null], count: 1, share: 1 / 3 },
        ],
      },
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );

  assert.match(markup, /Group Data Summary/);
  assert.match(markup, /Group Data Key uniqueness/);
  assert.match(markup, /Groups are defined by values in these selected columns:/);
  assert.match(markup, /Department, Approval_Status/);
  assert.match(markup, /Distinct Group Data Keys/);
  assert.match(markup, /Keys occurring once/);
  assert.match(markup, /Keys occurring more than once/);
  assert.match(markup, /Input Rows in repeated-key groups/);
  assert.match(markup, /Singleton-key share of distinct keys/);
  assert.match(markup, /Distinct Group Data Keys<\/dt><dd[^>]*>2<\/dd>/);
  assert.match(markup, /Keys occurring once<\/dt><dd[^>]*>1<\/dd>/);
  assert.match(markup, /Keys occurring more than once<\/dt><dd[^>]*>1<\/dd>/);
  assert.match(markup, /Input Rows in repeated-key groups<\/dt><dd[^>]*>2<\/dd>/);
  assert.match(markup, /50% \(1 of 2 keys\)/);
  assert.match(markup, /Sales/);
  assert.match(markup, /Approved/);
  assert.match(markup, /Operations/);
  assert.match(markup, /Input Rows/);
  assert.match(markup, /Share/);
  assert.match(markup, /aria-label="Sort by Department"/);
  assert.match(markup, /aria-label="Sort by Approval_Status"/);
  assert.match(markup, /aria-label="Sort by Input Rows"/);
  assert.match(markup, /aria-label="Sort by Share"/);
  assert.equal(
    (markup.match(/<th class="sticky top-0 z-10 [^"]*" scope="col"/g) ?? []).length,
    4,
  );
  assert.equal((markup.match(/<thead>/g) ?? []).length, 1);
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
  assert.match(markup, /aria-label="Sort by Term"/);
  assert.match(markup, /aria-label="Sort by Input Rows"/);
  assert.match(markup, /aria-label="Sort by Share"/);
  assert.match(markup, /aria-label="Sort by Format"/);
  assert.match(markup, /aria-label="Sort by Occurrences"/);
  assert.match(markup, /aria-label="Sort by Distinct terms"/);
  assert.equal(
    (markup.match(/<th class="sticky top-0 z-10 [^"]*" scope="col"/g) ?? []).length,
    7,
  );
  assert.equal((markup.match(/<thead>/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-haspopup="dialog"/g) ?? []).length, 9);
  assert.match(markup, /aria-label="View Input Rows for the term &quot;EMP-0001&quot;"/);
  assert.match(markup, /aria-label="View Input Rows for the format &quot;EMP-&lt;4 digits&gt;&quot;"/);
});

test("Formal Terms excludes the Missing Value bucket from its distinct-term count", async () => {
  const { FormalTermsResults } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisPanel.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(FormalTermsResults, {
      summary: {
        kind: "formal_terms",
        input_rows: 2,
        selected_columns: ["Status"],
        columns: [
          {
            name: "Status",
            terms: [
              { value: "Open", count: 1, share: 0.5 },
              { value: null, count: 1, share: 0.5 },
            ],
            format_patterns: [],
          },
        ],
      },
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );

  assert.match(markup, /1 distinct Formal Terms in 2 Input Rows\. Missing Values are excluded\./);
  assert.doesNotMatch(markup, /2 distinct Formal Terms/);
  assert.match(markup, /\(blank\)/);
});

test("every data column in analysis summaries exposes a filter and a sort control", async () => {
  const { FormalTermsResults, GroupDataResults } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisPanel.tsx",
  );
  const groupMarkup = renderToStaticMarkup(
    React.createElement(GroupDataResults, {
      summary: {
        kind: "group_data",
        input_rows: 2,
        selected_columns: ["Department", "Status"],
        key_uniqueness: {
          distinct_key_count: 2,
          singleton_key_count: 2,
          repeated_key_count: 0,
          input_rows_in_repeated_key_groups: 0,
          singleton_key_share: 1,
        },
        groups: [
          { values: ["Sales", "Open"], count: 1, share: 0.5 },
          { values: ["Support", null], count: 1, share: 0.5 },
        ],
      },
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );
  const termsMarkup = renderToStaticMarkup(
    React.createElement(FormalTermsResults, {
      summary: {
        kind: "formal_terms",
        input_rows: 2,
        selected_columns: ["Employee_Code"],
        columns: [
          {
            name: "Employee_Code",
            terms: [{ value: "EMP-1", count: 1, share: 0.5 }],
            format_patterns: [
              {
                pattern: "EMP-<1 digit>",
                occurrence_count: 1,
                distinct_term_count: 1,
                share: 0.5,
              },
            ],
          },
        ],
      },
      onDetailOpened: () => {},
      onChangeColumns: () => {},
    }),
  );

  const summaryTables = [
    [groupMarkup, ["Department", "Status", "Input Rows", "Share"]],
    [
      termsMarkup,
      ["Term", "Input Rows", "Share"],
      ["Format", "Occurrences", "Distinct terms", "Share"],
    ],
  ];

  for (const [markup, ...expectedTableColumns] of summaryTables) {
    const tableHeaders = [...markup.matchAll(/<thead>([\s\S]*?)<\/thead>/g)];
    assert.equal(tableHeaders.length, expectedTableColumns.length);
    for (const [tableIndex, tableHeader] of tableHeaders.entries()) {
      const headerCells = [...tableHeader[1].matchAll(/<th\b[^>]*>[\s\S]*?<\/th>/g)];
      const expectedLabels = expectedTableColumns[tableIndex];
      assert.equal(headerCells.length, expectedLabels.length + 1);

      const actionHeader = headerCells[0][0];
      assert.match(actionHeader, /Input Row details/);
      assert.doesNotMatch(actionHeader, /aria-label="(?:Filter|Sort by )/);

      for (const [columnIndex, label] of expectedLabels.entries()) {
        const header = headerCells[columnIndex + 1][0];
        const sortButton = header.match(
          /<button\b[^>]*aria-label="Sort by [^"]+"[^>]*>[\s\S]*?<\/button>/,
        )?.[0];
        const filterButton = header.match(
          /<button\b[^>]*aria-label="Filter [^"]+"[^>]*>[\s\S]*?<\/button>/,
        )?.[0];

        assert.ok(sortButton?.includes(label));
        assert.doesNotMatch(sortButton ?? "", /<svg/);
        assert.ok(filterButton);
        assert.notEqual(sortButton, filterButton);
      }
    }
  }
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
        key_uniqueness: {
          distinct_key_count: 1,
          singleton_key_count: 1,
          repeated_key_count: 0,
          input_rows_in_repeated_key_groups: 0,
          singleton_key_share: 1,
        },
        groups: [{ values: [hostileValue], count: 1, share: 1 }],
      },
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
  for (const mode of [
    "Completeness Patterns",
    "Column Profile",
    "Formal Terms",
    "Group Data",
    "Data Contracts",
  ]) {
    const tabButtonPattern = new RegExp(
      `<button[^>]*role="tab"[^>]*disabled=""[^>]*>${mode}<\\/button>`,
    );
    assert.match(markup, tabButtonPattern);
  }
  for (const mode of [
    "completeness",
    "column_profile",
    "formal_terms",
    "group_data",
    "data_contract",
  ]) {
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

test("selecting the Column Profile tab reports the selected mode", async () => {
  const { AnalysisModeTabs } = await viteServer.ssrLoadModule(
    "/src/AnalysisModeTabs.tsx",
  );
  const selectedModes = [];
  const tabs = AnalysisModeTabs({
    selectedMode: null,
    enabled: true,
    onSelect: (mode) => selectedModes.push(mode),
  });
  const profileTab = collectElements(
    tabs,
    (element) => element.type === "button" && element.props.id === "analysis-tab-column_profile",
  )[0];

  assert.ok(profileTab);
  profileTab.props.onClick();

  assert.deepEqual(selectedModes, ["column_profile"]);
});

test("column profile panel renders empty, loading, error, and populated states", async () => {
  const { ColumnProfileView } = await viteServer.ssrLoadModule(
    "/src/ColumnProfilePanel.tsx",
  );
  const { parseColumnProfileJobStatus } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
  const successfulJob = parseColumnProfileJobStatus(successfulColumnProfileStatus());
  const renderProfile = (state, onFormalTermsRequested = () => {}) => {
    return React.createElement(ColumnProfileView, {
      state,
      canceling: false,
      onBuildProfile: () => {},
      onCancelProfile: () => {},
      onFormalTermsRequested,
    });
  };

  const emptyMarkup = renderToStaticMarkup(renderProfile({ kind: "empty" }));
  const loadingMarkup = renderToStaticMarkup(
    renderProfile({
      kind: "job",
      job: {
        ...successfulJob,
        state: "running",
        stage: "Counting values in each source column",
        progress: { itemsDone: 1, itemsTotal: 2 },
        result: null,
      },
    }),
  );
  const errorMarkup = renderToStaticMarkup(
    renderProfile({
      kind: "job",
      job: {
        ...successfulJob,
        state: "failed",
        stage: null,
        progress: null,
        result: null,
        error: "The uploaded file contains a header row but no Input Rows.",
      },
    }),
  );

  assert.match(emptyMarkup, /No column profile has been built for this file\./);
  assert.match(emptyMarkup, />Build profile</);
  assert.match(loadingMarkup, /role="status"/);
  assert.match(loadingMarkup, /Counting values in each source column/);
  assert.match(loadingMarkup, /1 of 2 columns profiled\./);
  assert.match(loadingMarkup, />Cancel profile</);
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /The uploaded file contains a header row but no Input Rows\./);
  assert.match(errorMarkup, />Try again</);

  let buildRequests = 0;
  const emptyView = ColumnProfileView({
    state: { kind: "empty" },
    canceling: false,
    onBuildProfile: () => {
      buildRequests += 1;
    },
    onCancelProfile: () => {},
    onFormalTermsRequested: () => {},
  });
  assert.equal(buildRequests, 0);
  const buildButton = collectElements(
    emptyView,
    (element) => element.type === "button" && element.props.children === "Build profile",
  )[0];
  assert.ok(buildButton);
  buildButton.props.onClick();
  assert.equal(buildRequests, 1);

  const requestedColumns = [];
  const populatedView = ColumnProfileView({
    state: { kind: "job", job: successfulJob },
    canceling: false,
    onBuildProfile: () => {},
    onCancelProfile: () => {},
    onFormalTermsRequested: (columnName) => requestedColumns.push(columnName),
  });
  const populatedMarkup = renderToStaticMarkup(populatedView);

  assert.match(populatedMarkup, /Column profile results/);
  assert.match(populatedMarkup, /4 Input Rows/);
  assert.match(populatedMarkup, /3 of 4 Input Rows \(75%\)/);
  assert.match(populatedMarkup, /1 of 4 Input Rows \(25%\)/);
  assert.match(populatedMarkup, /2 of 3 present values \(66\.67%\)/);
  assert.match(populatedMarkup, /0 of 0 present values \(share unavailable because there are no present values\)/);
  assert.ok(populatedMarkup.indexOf("Status") < populatedMarkup.indexOf("All missing"));
  assert.match(populatedMarkup, /Open Formal Terms for Status/);
  assert.match(populatedMarkup, /Present and missing shares use all Input Rows/);

  const formalTermsButton = collectElements(
    populatedView,
    (element) => element.type === "button" && element.props["aria-label"] === "Open Formal Terms for Status",
  )[0];
  assert.ok(formalTermsButton);
  formalTermsButton.props.onClick();
  assert.deepEqual(requestedColumns, ["Status"]);
});

test("profile headers render as inert text and scope changes reset the panel key", async () => {
  const { ColumnProfileView } = await viteServer.ssrLoadModule(
    "/src/ColumnProfilePanel.tsx",
  );
  const { columnProfileScopeKey } = await viteServer.ssrLoadModule(
    "/src/columnProfileScope.ts",
  );
  const { parseColumnProfileJobStatus } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
  const hostileHeader = "<img src=x onerror=alert(1)>";
  const status = parseColumnProfileJobStatus(successfulColumnProfileStatus());
  status.result.columns[0].name = hostileHeader;
  const markup = renderToStaticMarkup(
    React.createElement(ColumnProfileView, {
      state: { kind: "job", job: status },
      canceling: false,
      onBuildProfile: () => {},
      onCancelProfile: () => {},
      onFormalTermsRequested: () => {},
    }),
  );

  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /<img\b/i);
  assert.equal(columnProfileScopeKey(1, {}), columnProfileScopeKey(1, {}));
  assert.notEqual(columnProfileScopeKey(1, {}), columnProfileScopeKey(2, {}));
  assert.notEqual(
    columnProfileScopeKey(1, {}),
    columnProfileScopeKey(1, { Status: ["N/A"] }),
  );
});

test("a profile column action switches to Formal Terms with only that column selected", async () => {
  const { ColumnProfileView } = await viteServer.ssrLoadModule(
    "/src/ColumnProfilePanel.tsx",
  );
  const { parseColumnProfileJobStatus } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
  const { columnProfileScopeKey } = await viteServer.ssrLoadModule(
    "/src/columnProfileScope.ts",
  );
  const { profileColumnSelectionOutcome } = await viteServer.ssrLoadModule(
    "/src/formalTermsSelection.ts",
  );
  const scope = columnProfileScopeKey(1, {});
  const columnNames = ["Status", "All missing"];
  let activeMode = "column_profile";
  let selectedColumns = ["Status", "All missing"];
  let profileStarts = 0;
  const view = ColumnProfileView({
    state: {
      kind: "job",
      job: parseColumnProfileJobStatus(successfulColumnProfileStatus()),
    },
    canceling: false,
    onBuildProfile: () => {
      profileStarts += 1;
    },
    onCancelProfile: () => {},
    onFormalTermsRequested: (columnName) => {
      const outcome = profileColumnSelectionOutcome(scope, columnNames, {
        scope,
        columnName,
      });
      if (outcome === "selected") {
        selectedColumns = [columnName];
      }
      if (outcome === "selected" || outcome === "column_unavailable") {
        activeMode = "formal_terms";
      }
    },
  });
  const action = collectElements(
    view,
    (element) => element.type === "button" && element.props["aria-label"] === "Open Formal Terms for Status",
  )[0];

  assert.ok(action);
  action.props.onClick();

  assert.equal(activeMode, "formal_terms");
  assert.deepEqual(selectedColumns, ["Status"]);
  assert.equal(profileStarts, 0);
});

test("Formal Terms profile handoffs reject stale scopes and missing columns", async () => {
  const { columnProfileScopeKey } = await viteServer.ssrLoadModule(
    "/src/columnProfileScope.ts",
  );
  const { profileColumnSelectionOutcome } = await viteServer.ssrLoadModule(
    "/src/formalTermsSelection.ts",
  );
  const currentScope = columnProfileScopeKey(2, { Status: ["N/A"] });
  const staleScope = columnProfileScopeKey(1, { Status: ["N/A"] });

  assert.equal(
    profileColumnSelectionOutcome(currentScope, ["Status"], {
      scope: staleScope,
      columnName: "Status",
    }),
    "stale_scope",
  );
  assert.equal(
    profileColumnSelectionOutcome(currentScope, ["Status"], {
      scope: currentScope,
      columnName: "Missing",
    }),
    "column_unavailable",
  );
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
      columnMode: "all",
      analysisColumns: ["value"],
      onColumnModeChange: () => {},
      filters: {},
      onFiltersChanged: () => {},
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
  assert.match(markup, /All source columns/);
  assert.match(markup, /Columns used in analysis/);
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
    columnMode: "all",
    analysisColumns: [],
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
  const filteredEmptyMarkup = renderDialog({
    filters: { department: { kind: "contains", value: "Finance" } },
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
  assert.match(filteredEmptyMarkup, /No Input Rows match the current filters/);
  assert.match(filteredEmptyMarkup, /Clear all filters/);
  assert.doesNotMatch(filteredEmptyMarkup, /Return to summary/);
  assert.match(errorMarkup, /role="alert"/);
  assert.match(errorMarkup, /The matching rows could not be retrieved\./);
  assert.match(errorMarkup, /Retry loading rows/);

  const exportButton = exportLoadingMarkup.match(
    /<button[^>]*aria-label="Preparing CSV download"[^>]*>/,
  )?.[0];
  assert.ok(exportButton);
  assert.match(exportButton, /\sdisabled=""/);
  assert.match(exportLoadingMarkup, /Preparing the full row export/);
  assert.match(exportErrorMarkup, /role="alert"/);
  assert.match(exportErrorMarkup, /The CSV could not be downloaded\./);
  assert.match(exportSuccessMarkup, /role="status"/);
  assert.match(exportSuccessMarkup, /CSV download started\./);
});

test("data-analysis details can render only the completed analysis columns", async () => {
  const { DataAnalysisRowsDialog } = await viteServer.ssrLoadModule(
    "/src/DataAnalysisRowsDialog.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(DataAnalysisRowsDialog, {
      title: "Rows for a Formal Term",
      targetDescription: 'the term "example"',
      matchingRowCount: 1,
      columnMode: "analysis",
      analysisColumns: ["value"],
      onColumnModeChange: () => {},
      filters: {},
      onFiltersChanged: () => {},
      page: {
        columns: ["record_id", "value", "unselected"],
        rows: [["A1", "example", "not used"]],
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
  const tableRegion = markup.match(
    /<div[^>]*role="region"[^>]*aria-label="Matching Input Rows\. Scroll to view additional columns or rows\."[^>]*>([\s\S]*?)<\/div>/,
  )?.[1];

  assert.ok(tableRegion);
  assert.match(tableRegion, /aria-label="Filter value"[\s\S]*?<td[^>]*><span[^>]*>example<\/span><\/td>/);
  assert.doesNotMatch(tableRegion, /record_id|A1|unselected|not used/);
  assert.equal((tableRegion.match(/<th\b/g) ?? []).length, 1);
  assert.equal((tableRegion.match(/<td\b/g) ?? []).length, 1);
});

test("data-analysis row requests include the selected result target and page", async () => {
  const { fetchDataAnalysisRowsPage } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
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
    const page = await fetchDataAnalysisRowsPage(
      "job-123",
      { kind: "term", columnIndex: 1, itemIndex: 4 },
      2,
      requestSignal,
      filters,
    );

    const requestUrl = new URL(requestedUrl, "http://localhost");
    assert.equal(requestUrl.pathname, "/api/data-analysis-jobs/job-123/rows");
    assert.equal(requestUrl.searchParams.get("target_kind"), "term");
    assert.equal(requestUrl.searchParams.get("item_index"), "4");
    assert.equal(requestUrl.searchParams.get("column_index"), "1");
    assert.equal(requestUrl.searchParams.get("page"), "2");
    assert.equal(requestUrl.searchParams.get("filters"), JSON.stringify(filters));
    assert.equal(requestedSignal, requestSignal);
    assert.equal(page.page, 2);
    assert.equal(page.total_rows, 51);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("data-analysis CSV exports preserve column mode and row filters", async () => {
  const { downloadDataAnalysisRowsCsv } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
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
    const filters = { record_id: { kind: "missing" } };
    await assert.rejects(
      downloadDataAnalysisRowsCsv(
        "job-123",
        "formal_terms",
        { kind: "term", columnIndex: 2, itemIndex: 7 },
        "analysis",
        filters,
      ),
      /Expected export failure for request inspection\./,
    );
    const requestUrl = new URL(requestedUrl, "http://localhost");
    assert.equal(requestUrl.pathname, "/api/data-analysis-jobs/job-123/exports/rows.csv");
    assert.equal(requestUrl.searchParams.get("target_kind"), "term");
    assert.equal(requestUrl.searchParams.get("item_index"), "7");
    assert.equal(requestUrl.searchParams.get("column_index"), "2");
    assert.equal(requestUrl.searchParams.get("column_mode"), "analysis");
    assert.equal(requestUrl.searchParams.get("filters"), JSON.stringify(filters));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("column profile responses parse into camel-case counts with denominator kinds", async () => {
  const { parseColumnProfileJobStatus, presentValuesMetricShare } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
  const profile = parseColumnProfileJobStatus(successfulColumnProfileStatus());

  assert.equal(profile.analysisKind, "column_profile");
  assert.equal(profile.jobId, "profile-job-1");
  assert.deepEqual(profile.progress, { itemsDone: 2, itemsTotal: 2 });
  assert.deepEqual(profile.result.columns[0], {
    name: "Status",
    present: {
      count: 3,
      denominator: 4,
      denominatorKind: "input_rows",
    },
    missing: {
      count: 1,
      denominator: 4,
      denominatorKind: "input_rows",
    },
    distinctTerms: {
      count: 2,
      denominator: 3,
      denominatorKind: "present_values",
    },
  });
  assert.equal(presentValuesMetricShare(profile.result.columns[1].distinctTerms), null);
});

test("column profile boundary rejects invalid states, denominators, and extra term data", async () => {
  const { parseColumnProfileJobStatus, DataAnalysisRequestError } =
    await viteServer.ssrLoadModule("/src/dataAnalysisApi.ts");
  const invalidDenominatorKind = structuredClone(successfulColumnProfileStatus());
  invalidDenominatorKind.result.columns[0].distinct_terms.denominator_kind = "input_rows";
  const invalidShareDenominator = structuredClone(successfulColumnProfileStatus());
  invalidShareDenominator.result.columns[0].distinct_terms.denominator = 4;
  const invalidState = {
    ...successfulColumnProfileStatus(),
    state: "running",
  };
  const extraTermData = structuredClone(successfulColumnProfileStatus());
  extraTermData.result.columns[0].terms = [{ value: "secret", count: 1 }];

  for (const payload of [
    invalidDenominatorKind,
    invalidShareDenominator,
    invalidState,
    extraTermData,
  ]) {
    assert.throws(
      () => parseColumnProfileJobStatus(payload),
      (error) => error instanceof DataAnalysisRequestError && /invalid column profile/i.test(error.message),
    );
  }
});

test("column profile start sends the file, applied markers, and optional worksheet", async () => {
  const { startColumnProfileJob } = await viteServer.ssrLoadModule(
    "/src/dataAnalysisApi.ts",
  );
  const previousFetch = globalThis.fetch;
  let requestUrl = "";
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return { ok: true, json: async () => successfulColumnProfileStatus() };
  };

  try {
    const status = await startColumnProfileJob(
      new File(["Status\nActive\n"], "customers.csv", { type: "text/csv" }),
      "Customers",
      { Status: ["N/A"] },
    );
    const formData = requestOptions.body;

    assert.equal(requestUrl, "/api/column-profile-jobs");
    assert.equal(requestOptions.method, "POST");
    assert.equal(formData.get("file").name, "customers.csv");
    assert.equal(formData.get("sheet"), "Customers");
    assert.equal(formData.get("missing_markers"), JSON.stringify({ Status: ["N/A"] }));
    assert.equal(status.result.inputRows, 4);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("column profile polling and cancellation use their dedicated job routes", async () => {
  const { cancelColumnProfileJob, fetchColumnProfileJobStatus } =
    await viteServer.ssrLoadModule("/src/dataAnalysisApi.ts");
  const previousFetch = globalThis.fetch;
  const requests = [];
  const signal = new AbortController().signal;
  const cancelledStatus = {
    ...successfulColumnProfileStatus(),
    state: "cancelled",
    progress: { items_done: 1, items_total: 2 },
    result: null,
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      json: async () => (url.includes("/cancel") ? cancelledStatus : successfulColumnProfileStatus()),
    };
  };

  try {
    const status = await fetchColumnProfileJobStatus("profile/one", signal);
    const cancelled = await cancelColumnProfileJob("profile/one");

    assert.equal(new URL(requests[0].url, "http://localhost").pathname, "/api/column-profile-jobs/profile%2Fone");
    assert.equal(requests[0].options.signal, signal);
    assert.equal(new URL(requests[1].url, "http://localhost").pathname, "/api/column-profile-jobs/profile%2Fone/cancel");
    assert.equal(requests[1].options.method, "POST");
    assert.equal(status.state, "succeeded");
    assert.equal(cancelled.state, "cancelled");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
