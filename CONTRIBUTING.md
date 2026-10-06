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

Requirements: Node.js 22 and pnpm 10 (the versions CI uses).

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
pnpm test       # Vitest unit tests
pnpm build      # builds the demo and packages the library
```

`pnpm format` fixes formatting. Files must use LF line endings.

## Pull requests

- Branch from `main` and keep one logical change per pull request.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `fix: keep focus on the tab after a drop`, `docs: document maximizedView`.
- Add or update tests in `src/lib/*.test.ts` when you change `utils.ts`.
- Every pull request is reviewed by at least one maintainer before it is
  merged. An automated AI review may also comment; maintainers decide which of
  its suggestions apply.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).
