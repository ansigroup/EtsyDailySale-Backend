# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the TypeScript application code. Entry point is `src/index.ts`.
- `src/models/`, `src/routes/`, `src/utils/`, and `src/types/` contain data models, API routes, helpers, and local type overrides.
- `dist/` is the build output (compiled JavaScript).
- `docs/` contains project documentation. `default.env` provides example environment variables.
- `mongo-db/` holds local database assets/config used during development.

## Build, Test, and Development Commands
- `npm run dev`: run the server with `ts-node-dev` and auto-restart on changes.
- `npm run build`: compile TypeScript from `src/` to `dist/`.
- `npm start`: start the compiled server from `dist/index.js`.

## Coding Style & Naming Conventions
- Language: TypeScript targeting ES2020 with CommonJS modules (see `tsconfig.json`).
- Keep code under `src/`; follow existing folder conventions for new modules.
- Use descriptive, lowerCamelCase for functions/variables and UpperCamelCase for classes/types.
- No formatter or linter is configured; keep changes consistent with nearby files.

## Testing Guidelines
- No test framework or `test` script is configured. If you add tests, document the framework and add a `npm run test` script.
- Prefer naming tests by feature or route (e.g., `orders.controller.test.ts`) and keep them close to the code or in a top-level `tests/` folder.

## Commit & Pull Request Guidelines
- Recent history includes short messages like `upd`; no enforced convention is evident. Prefer concise, imperative messages (e.g., `Add license validation route`).
- PRs should include: a clear summary, linked issues (if any), and steps to validate (commands, sample requests, or screenshots for API output).

## Configuration & Security Tips
- Copy `default.env` to `.env` for local runs and update secrets/keys.
- Do not commit credentials, private keys, or production tokens.
