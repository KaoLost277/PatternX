# Repository instructions

- For UI, styles, or copy, follow [UI_DESIGN.md](UI_DESIGN.md); for code, follow [CODE_STYLE.md](CODE_STYLE.md).

## App boundaries

- `frontend/src/main.tsx` mounts the React app; Vite proxies `/api` to FastAPI on `127.0.0.1:8000`. Use `run.ps1` (Windows) or `run.sh` (macOS/Linux) to start both services; Vite alone does not start the API.
- Keep the app local/offline and the API loopback-only. For backend storage or network changes, read relevant [ADRs](docs/adr/) and preserve cleanup of request/job uploads, normalized files, and temporary SQLite data.

## Verification

- Backend: install dev dependencies into the root `.venv` using [README.md](README.md)'s platform commands. From `backend/`, run `../.venv/Scripts/python.exe -m pytest -q` (Windows) or `../.venv/bin/python -m pytest -q` (macOS); append a test path such as `tests/test_pattern_preview.py` to focus one file. Pytest allows only loopback sockets.
- Frontend CI order: `npm ci --prefix frontend`, `npm run test:safety --prefix frontend`, `npm run lint --prefix frontend`, then `npm run build --prefix frontend` ([workflow](.github/workflows/verify.yml)).
- Run one frontend test from `frontend/`, e.g. `node --test --test-concurrency=1 tests/hostile-render.test.mjs`; tests resolve `vite.config.ts` relative to the current directory.

## Domain and issues

- This is a single-context domain: use root [CONTEXT.md](CONTEXT.md) and relevant [ADRs](docs/adr/); see [docs/agents/domain.md](docs/agents/domain.md) for the domain-doc workflow.
- Issues/specs live on GitHub; use `gh` via [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
