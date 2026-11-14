# Contributing to horizon-layout

Thanks for helping. horizon-layout is the docking layout used by the
[Horizon](https://github.com/play-horizon) editor, published under the MIT
license. Bug reports, fixes, docs and new keyboard controls are all welcome.

## Before you start

- **Bugs**: open an issue with the `LayoutConfig` that triggers it (the demo's
  _Config_ tab shows the live value) and the browser you used.
- **Features**: open an issue first so we can agree on the API before you
  write code. The component is headless and dependency-free; changes that add a
  runtime dependency are unlikely to be accepted.

## Setup

Requirements: Node.js 24 and pnpm 12 (the versions CI uses: `.node-version` and the
`packageManager` field of `package.json`). pnpm refuses to install with a Node older than 24.2
(`devEngines` in `package.json`); apps that install the package aren't affected.

```sh
git clone https://github.com/play-horizon/horizon-layout.git
cd horizon-layout
pnpm install --frozen-lockfile
pnpm dev        # demo app on http://localhost:5173
```

## Checks

Run these before opening a pull request; CI runs the same commands.

```sh
pnpm check      # svelte-check type checking
pnpm lint       # oxlint + oxfmt --check
pnpm test       # Vitest unit and component tests
pnpm build      # builds the demo and packages the library
```

`pnpm format` fixes formatting. Files must use LF line endings.

## Pull requests

- Branch from `main` and keep one logical change per pull request.
- Commit subjects are `TYPE: summary`, under 50 characters, with one of the types `FEAT`,
  `FIX`, `DOCS`, `STYLE`, `REFACTOR`, `PERF`, `TEST`, `BUILD`, `CI` or `CHORE`:
  `FIX: keep focus on the tab after a drop`, `DOCS: document maximizedView`. Add a short body
  only when the why isn't obvious.
- Add or update tests with every change: unit tests in `src/lib/*.test.ts`, component tests in
  `src/lib/*.svelte.test.ts` (rendered through `src/test/LayoutHarness.svelte`).
- Every pull request is reviewed by at least one maintainer before it is
  merged. An automated AI review may also comment; maintainers decide which of
  its suggestions apply.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).
