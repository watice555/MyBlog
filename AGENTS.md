# Repository Guidelines

## Project Structure & Module Organization

`app/` contains the Next.js/Vinext UI, metadata, styles, and generated article data. `content/posts/*.md` is the source of truth for published writing; `scripts/generate-posts.mjs` validates those files and regenerates `app/generated-posts.ts`, which must not be edited by hand. `build/local-posts-plugin.mjs` implements the localhost-only post and image write APIs used by the browser editor, while `vite.config.ts` wires the local plugins and Cloudflare runtime together. Tests live in `tests/`, public assets live in `public/`, and GitHub Pages deployment is defined in `.github/workflows/deploy.yml`.

Treat `.next/`, `.vinext/`, `dist/`, `out/`, `.wrangler/`, `node_modules/`, and `.local/` as generated or machine-local material. `.local/` may contain private LLM configuration and must never be committed. Images intentionally saved under `public/images/posts/` are published article assets and should be committed with the article that uses them.

## Build, Test, and Development Commands

- `npm install`: install dependencies for local development; CI uses `npm ci`.
- `npm run edit:local`: start the development server and open the localhost editor directly.
- `npm run dev`: regenerate article data and start the Vinext development server.
- `npm run content:generate`: validate `content/posts/` and regenerate `app/generated-posts.ts`.
- `npm run lint`: regenerate article data and run ESLint.
- `npm run build`: create the Cloudflare/Vinext production build.
- `npm run build:github`: create the static Next.js export used by GitHub Pages.
- `npm test`: build the Vinext worker and run the rendered HTML and repository behavior tests.

Run the narrowest relevant checks first, then run `npm run lint` and `npm test` for application, editor, rendering, or local API changes. Run `npm run build:github` when metadata, routing, static assets, or deployment behavior changes.

## Coding Style & Testing

Use TypeScript/React with 2-space indentation, double quotes, semicolons, and the existing functional-component and hook patterns. Keep browser state, Markdown rendering, local editor behavior, filesystem writes, and generated content responsibilities separate. Preserve hash-based routes and GitHub Pages subpath compatibility; use relative application URLs rather than assuming the site is hosted at `/`.

Add focused tests in `tests/rendered-html.test.mjs` when changing public rendering, author-only controls, Markdown behavior, image handling, or local write endpoints. Public builds must not expose editor controls or localhost-only API behavior. For visible UI changes, also inspect the local site at common desktop and mobile widths when practical.

## Content & Generated Files

Each file in `content/posts/` must contain non-empty Markdown plus valid front matter. `title` and `date` are required, `date` uses `YYYY-MM-DD`, `slug` must be unique, `category` defaults to `随笔`, and `excerpt` is optional. Preserve an author's wording, slugs, dates, and article files unless content editing is explicitly in scope. Do not delete or replace posts merely to make tests pass.

After adding, editing, renaming, or deleting a post, run `npm run content:generate` and include the corresponding `app/generated-posts.ts` update in the same commit. Keep post image references portable and store publishable uploads under `public/images/posts/年/月/`.

## Local Editor Safety

The editor and filesystem APIs are intentionally local-only. Preserve loopback-host checks, allowed-origin validation, HTTP method restrictions, path normalization, filename collision handling, MIME and file-signature validation, upload size limits, and safe writes inside `content/posts/` and `public/images/posts/`. Fail closed on ambiguous or malformed input. Do not add remote write access, authentication tokens, secrets, or automatic GitHub publishing to the browser editor.

Use disposable files for API tests. Never point destructive validation at unrelated user files, and never commit browser drafts, local model settings, logs, caches, credentials, or absolute personal paths.

## Commit & Delivery Workflow

Work directly on `main` unless the user explicitly requests a separate branch or pull request. After a cohesive change is complete and validated, review `git status --short`, stage only files that belong to the task, create a concise imperative commit, and push `main` to `origin`. Preserve unrelated user edits, never force-push, and safely integrate upstream changes if the remote has advanced.

Pushing `main` triggers the GitHub Pages workflow. Before pushing changes that affect published output, ensure the static export succeeds and call out any skipped or blocked validation in the handoff.
