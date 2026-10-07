import assert from "node:assert/strict";
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

test("benchmark warnings start beyond the largest measured CSV and column selection", async () => {
  const {
    csvExceedsBenchmarkSize,
    MAX_BENCHMARKED_FILE_SIZE_MIB,
    MAX_BENCHMARKED_SELECTED_COLUMNS,
    selectedColumnsExceedBenchmark,
  } = await viteServer.ssrLoadModule("/src/benchmarkLimits.ts");
  const largestRecordedFileSizeBytes = MAX_BENCHMARKED_FILE_SIZE_MIB * 1024 * 1024;

  assert.equal(MAX_BENCHMARKED_FILE_SIZE_MIB, 215.72);
  assert.equal(MAX_BENCHMARKED_SELECTED_COLUMNS, 21);
  assert.equal(csvExceedsBenchmarkSize(largestRecordedFileSizeBytes), false);
  assert.equal(csvExceedsBenchmarkSize(largestRecordedFileSizeBytes + 1), true);
  assert.equal(selectedColumnsExceedBenchmark(MAX_BENCHMARKED_SELECTED_COLUMNS), false);
  assert.equal(selectedColumnsExceedBenchmark(MAX_BENCHMARKED_SELECTED_COLUMNS + 1), true);
});
