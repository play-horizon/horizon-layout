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

Requirements: Node.js 24 and pnpm 12, the versions CI uses. `devEngines` in `package.json`
requires Node 24.2 or later, and pnpm refuses to install with an older one (apps that install the
package aren't affected). `.node-version` names the Node version CI runs, and the
`packageManager` field of `package.json` pins the exact pnpm version.

```sh
git clone https://github.com/play-horizon/horizon-layout.git
cd horizon-layout
pnpm install --frozen-lockfile
pnpm dev        # demo app on http://localhost:5173
```

## Checks

Run these before opening a pull request; CI runs the same commands on every push and pull
request.

```sh
pnpm lint       # oxlint + oxfmt --check
pnpm check      # svelte-check type checking
pnpm test       # Vitest unit and component tests
pnpm build      # builds the demo and packages the library
```

`pnpm format` fixes formatting. Files must use LF line endings.

## Pull requests

- Branch from `main` and keep one logical change per pull request. Fill in the pull request
  template: what changed, the breaking changes relative to the last release, how it was tested,
  and screenshots for visual changes.
- Commit subjects are `TYPE: summary`, under 50 characters, with one of the types `FEAT`,
  `FIX`, `DOCS`, `STYLE`, `REFACTOR`, `PERF`, `TEST`, `BUILD`, `CI` or `CHORE`:
  `FIX: keep focus on the tab after a drop`, `DOCS: document maximizedView`. Add a short body
  only when the why isn't obvious.
- Add or update tests with every change: unit tests in `src/lib/*.test.ts`, component tests in
  `src/lib/*.svelte.test.ts` (rendered through `src/test/LayoutHarness.svelte`), and the tests of
  the repository's scripts in `scripts/**/*.test.ts`.
- Every pull request is reviewed by at least one maintainer before it is
  merged. An automated AI review may also comment; maintainers decide which of
  its suggestions apply.

## Releases

A pull request ends with a commit that bumps `version` in `package.json`, following
[semantic versioning](https://semver.org) relative to the last release: a patch for fixes,
documentation and CI, a minor version for new features, a major version for breaking changes.
The bump stays the last commit: a change made after it (a review fix, for instance) is folded
into the commit it belongs to, or put before the bump, never after it. The commit subject is
`CHORE: bump version to <version>`.

Only maintainers merge into `main`, and the merge publishes the release. CI checks the merged
commit; when no `v<version>` tag exists yet, it packs the library, publishes it to npm with
provenance (trusted publishing, no stored token), then tags the commit and creates the GitHub
release. A version that already has a tag publishes nothing. Once CI passes on `main`, the demo is
deployed to [GitHub Pages](https://play-horizon.github.io/horizon-layout).

## Daily checks

Two scheduled workflows run every day on `main` (and on demand from the Actions tab). Both read
the lockfile alone, without installing anything, and list their findings in the job summary:

- **Vulnerability audit** (`.github/workflows/audit.yml`) runs `pnpm audit` over every package,
  production and development, and fails on any known vulnerability rated moderate or above.
  Below moderate, advisories are rated as having little or no impact; the summary still counts
  them. Run it locally with `pnpm audit --audit-level moderate`.
- **Outdated dependencies** (`.github/workflows/outdated.yml`) runs
  `node scripts/dependencies/outdated.ts`: it fails while a direct dependency has a newer version
  than the one the lockfile resolves, or pnpm a newer version than `packageManager` pins, unless
  the dependency is held back on purpose. `node` and `@types/node` follow the Node.js line CI runs
  (`.node-version`) rather than the newest release: `node` is left out (`pnpm outdated` compares the
  minimum of `devEngines` with the newest Node), and `@types/node` is outdated only when its major
  isn't that line's, or when a newer release of that line exists. Run it locally with
  `node scripts/dependencies/outdated.ts`.

  `scripts/dependencies/held-back.json` lists the dependencies held back, each with why and the day
  to look at it again, in the shape and with the rules of horizon-design's list:

  ```json
  { "typescript": { "reason": "…", "recheck": "2027-01-21" } }
  ```

  A hold keeps a dependency off its next breaking release only: while no release newer than its
  version is compatible with it (`^current`: the same major, or the same minor below 1.0), it
  passes and is listed in the report with its reason; a newer compatible release still fails the
  check. An entry fails the check the day after its recheck day (UTC; look at the reason again,
  then update the dependency or move the day), and when it is stale (its package has no newer
  version any more: remove the entry). The check also fails on an entry without a reason or a real
  `YYYY-MM-DD` day or with another field, on a held-back package whose versions aren't releases (a
  git or `link:` dependency has no compatible releases), and when the newest compatible release of
  a held-back package can't be looked up. A dependency is held back only for a real blocker (a dependency of
  ours that doesn't support its new version yet), never to put off moving to it.

GitHub pauses the scheduled workflows of a public repository after 60 days without activity;
the Actions tab turns them back on.

A failure is fixed by a pull request that updates the dependency (or, for a vulnerability with no
fixed version yet, removes or replaces the affected package), released like any other change.

## License

By contributing you agree that your contributions are licensed under the
[MIT License](./LICENSE).
