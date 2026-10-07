# SQLite synthetic benchmark on Windows

These measurements were taken on Windows 11 with Python 3.14.3 and SQLite 3.50.4, using [`benchmark_sqlite.py`](../../backend/benchmarks/benchmark_sqlite.py). The script generated a temporary CSV, validated it, loaded it into a temporary SQLite database, computed both summaries, and verified their exact counts against the generator's known pattern distribution. CSV generation time is excluded; validation, database loading, and both summaries are included.

| Input Rows | Columns | Selected Columns | Observed Patterns | CSV Size | Runtime | Peak Process Memory |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000,000 | 24 | 21 | 16 | 61.52 MiB | 22.32 s | 75.24 MiB |
| 2,000,000 | 24 | 21 | 16 | 123.04 MiB | 47.11 s | 75.17 MiB |
| 1,000,000 | 24 | 21 | 100,000 | 107.86 MiB | 29.14 s | 169.66 MiB |
| 2,000,000 | 24 | 21 | 100,000 | 215.72 MiB | 58.85 s | 169.70 MiB |

The synthetic files cycle through either 16 or 100,000 distinct completeness shapes across the selected columns; values also vary between rows. Exact per-column and per-pattern counts were checked successfully. The 100,000-pattern runs demonstrate a higher-cardinality case, but do not establish performance for datasets with millions of observed patterns. These results apply only to the measured Windows environment and generated distributions. They exclude XLSX conversion, HTTP upload/serialization, and export time. Do not use them as a general performance guarantee.

Run the benchmark from `backend` with:

```powershell
..\.venv\Scripts\python.exe -m benchmarks.benchmark_sqlite --rows 1000000
```
