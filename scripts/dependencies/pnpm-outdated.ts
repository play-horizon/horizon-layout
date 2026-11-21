/**
 * Reads what `pnpm outdated --format json` and `pnpm view <package> versions --json` print, for
 * the outdated check (`outdated.ts`): the direct dependencies with a newer version, and a
 * package's published versions; and the rule `node` and `@types/node` follow (`followNodeLine`).
 *
 * @module
 */

import type { Outdated } from './held-back.ts';
import { isNewer, parseRelease } from './versions.ts';

/** What a command printed on its standard output and error, and its exit status. */
export interface CommandResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * The direct dependencies `pnpm outdated --format json` lists, sorted by name. pnpm exits
 * non-zero both when something is outdated and when it fails, so a non-zero exit with nothing
 * listed is a failure.
 *
 * @throws When pnpm failed, or printed something other than its report.
 */
export function readOutdatedResult(result: CommandResult): Outdated[] {
	let report: unknown;
	try {
		report = JSON.parse(result.stdout);
	} catch {
		throw new Error(`pnpm outdated failed: ${result.stderr.trim() || result.stdout.trim()}`);
	}
	if (typeof report !== 'object' || report === null || Array.isArray(report)) {
		throw new Error('pnpm outdated printed no report.');
	}
	const entries = Object.entries(report as Record<string, unknown>);
	if (result.status !== 0 && entries.length === 0) {
		throw new Error(`pnpm outdated failed (exit status ${String(result.status)}).`);
	}
	return entries
		.map(([name, entry]) => {
			const { current, latest } = (entry ?? {}) as Record<string, unknown>;
			if (typeof current !== 'string' || typeof latest !== 'string') {
				throw new Error(`pnpm outdated gives no current and latest version of ${name}.`);
			}
			return { name, current, latest };
		})
		.sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The versions `pnpm view <package> versions --json` lists: one version is printed as a JSON
 * string, several as an array.
 *
 * @throws When pnpm failed, or printed something other than versions.
 */
export function readVersionsResult(name: string, result: CommandResult): string[] {
	if (result.status !== 0) {
		throw new Error(`pnpm view ${name} versions failed: ${result.stderr.trim()}`);
	}
	let printed: unknown;
	try {
		printed = JSON.parse(result.stdout);
	} catch {
		throw new Error(`pnpm view ${name} versions printed no JSON.`);
	}
	const versions = Array.isArray(printed) ? printed : [printed];
	if (!versions.every((version): version is string => typeof version === 'string')) {
		throw new Error(`pnpm view ${name} versions printed no list of versions.`);
	}
	return versions;
}

/**
 * `outdated` for a repository on the Node.js major `nodeMajor` (`.node-version`): without `node`
 * (the runtime is `.node-version`'s, not a dependency; pnpm compares the minimum of `devEngines`
 * with the newest release, which every Node release outdates), and with `@types/node` only when
 * its major isn't `nodeMajor` (its newer majors describe a Node the repository doesn't run), or
 * when `typesNodeLineLatest`, the newest release of its line, is newer than the locked one. This
 * is the rule `horizon-design` and the Horizon monorepo follow too.
 */
export function followNodeLine(
	outdated: readonly Outdated[],
	nodeMajor: number,
	typesNodeLineLatest: string | undefined
): Outdated[] {
	return outdated.flatMap((dependency) => {
		if (dependency.name === 'node') {
			return [];
		}
		if (dependency.name !== '@types/node' || parseRelease(dependency.current).major !== nodeMajor) {
			return [dependency];
		}
		return typesNodeLineLatest !== undefined &&
			isNewer(parseRelease(typesNodeLineLatest), parseRelease(dependency.current))
			? [{ ...dependency, latest: typesNodeLineLatest }]
			: [];
	});
}
