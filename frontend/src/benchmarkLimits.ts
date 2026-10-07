// The maximum recorded benchmark was a 215.72 MiB CSV with 21 selected columns.
// These measured boundaries are warnings, not supported-size guarantees.
export const MAX_BENCHMARKED_FILE_SIZE_MIB = 215.72;
export const MAX_BENCHMARKED_SELECTED_COLUMNS = 21;

const BYTES_PER_MEBIBYTE = 1024 * 1024;

export function csvExceedsBenchmarkSize(fileSizeBytes: number): boolean {
  const fileSizeMib = fileSizeBytes / BYTES_PER_MEBIBYTE;
  return fileSizeMib > MAX_BENCHMARKED_FILE_SIZE_MIB;
}

export function selectedColumnsExceedBenchmark(selectedColumnCount: number): boolean {
  return selectedColumnCount > MAX_BENCHMARKED_SELECTED_COLUMNS;
}
