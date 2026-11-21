/**
 * The outdated check, run as `node scripts/dependencies/outdated.ts` (by
 * `.github/workflows/outdated.yml` every day): it runs `pnpm outdated`, has `node` and
 * `@types/node` follow the Node.js line of `.node-version` (`followNodeLine`), judges what it lists
 * against the held-back list (`held-back.ts`, `held-back.json`), looking up the newest compatible
 * release of each held-back package (`pnpm view`), prints a Markdown report (also appended to the
 * job summary in GitHub Actions) and exits non-zero when the check fails. It needs nothing but Node.js and pnpm: nothing is
 * installed, so no dependency's code runs.
 *
 * @module
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { judge, parseHeldBack, type HeldBack, type Outdated, type Verdict } from './held-back.ts';
import {
	followNodeLine,
	readOutdatedResult,
	readVersionsResult,
	type CommandResult
} from './pnpm-outdated.ts';
import { isRelease, newestCompatible, parseRelease } from './versions.ts';

const root = path.resolve(import.meta.dirname, '..', '..');

function main(): boolean {
	let verdict: Verdict;
	const problems: string[] = [];
	try {
		const outdated = onNodeLine(readOutdatedResult(pnpm(['outdated', '--format', 'json'])));
		const heldBack = parseHeldBack(
			readFileSync(path.join(import.meta.dirname, 'held-back.json'), 'utf8')
		);
		verdict = judge(
			outdated,
			heldBack,
			new Date().toISOString().slice(0, 10),
			newestCompatibleVersions(outdated, heldBack, problems)
		);
	} catch (error) {
		publish(`## Outdated dependencies\n\nThe check failed: ${String(error)}`);
		return false;
	}
	const allProblems = [...problems, ...verdict.problems];
	publish(report(verdict, allProblems));
	return verdict.outdated.length === 0 && allProblems.length === 0;
}

/**
 * `outdated` with `node` and `@types/node` following the Node.js line of `.node-version`
 * (`followNodeLine`): the newest `@types/node` of that line is looked up when the locked one is
 * on it.
 *
 * @throws When pnpm fails, or `.node-version` names no Node.js major.
 */
function onNodeLine(outdated: readonly Outdated[]): Outdated[] {
	const nodeVersion = readFileSync(path.join(root, '.node-version'), 'utf8').trim();
	const nodeMajor = Number.parseInt(nodeVersion, 10);
	if (Number.isNaN(nodeMajor)) {
		throw new Error(`.node-version holds ${nodeVersion}, which names no Node.js major.`);
	}
	const typesNode = outdated.find((dependency) => dependency.name === '@types/node');
	const lineLatest =
		typesNode !== undefined &&
		isRelease(typesNode.current) &&
		parseRelease(typesNode.current).major === nodeMajor
			? newestCompatible(
					readVersionsResult('@types/node', pnpm(['view', '@types/node', 'versions', '--json'])),
					typesNode.current
				)
			: undefined;
	return followNodeLine(outdated, nodeMajor, lineLatest);
}

/**
 * The newest version compatible with the current one of each held-back package that is outdated,
 * from the registry. A package whose lookup fails gets none, and the failure is added to
 * `problems`; `judge` reports it too.
 */
function newestCompatibleVersions(
	outdated: readonly Outdated[],
	heldBack: readonly HeldBack[],
	problems: string[]
): Map<string, string> {
	const compatible = new Map<string, string>();
	for (const entry of heldBack) {
		const dependency = outdated.find((each) => each.name === entry.package);
		if (dependency === undefined || !isRelease(dependency.current)) {
			continue;
		}
		try {
			const versions = readVersionsResult(
				entry.package,
				pnpm(['view', entry.package, 'versions', '--json'])
			);
			compatible.set(entry.package, newestCompatible(versions, dependency.current));
		} catch (error) {
			problems.push(`The versions of ${entry.package} can't be looked up: ${String(error)}`);
		}
	}
	return compatible;
}

/**
 * Runs pnpm with `args` in the repository. On Windows, pnpm is a `.cmd` shim, which only starts
 * through a shell: there the command goes as one string, as Node.js deprecates passing arguments
 * to a shell (DEP0190); the arguments are package names and fixed flags, with no character a
 * shell interprets.
 */
function pnpm(args: readonly string[]): CommandResult {
	const options = { cwd: root, encoding: 'utf8' } as const;
	const result =
		process.platform === 'win32'
			? spawnSync(`pnpm ${args.join(' ')}`, { ...options, shell: true })
			: spawnSync('pnpm', args, options);
	if (result.error !== undefined) {
		throw new Error(`Couldn't run pnpm: ${result.error.message}`);
	}
	return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function report(verdict: Verdict, problems: readonly string[]): string {
	const sections = ['## Outdated dependencies'];
	sections.push(
		verdict.outdated.length === 0
			? "Every direct dependency that isn't held back is on its newest version."
			: table(
					['Package', 'Current', 'Latest'],
					verdict.outdated.map((dependency) => [
						`\`${dependency.name}\``,
						dependency.current,
						dependency.latest
					])
				)
	);
	if (verdict.heldBack.length > 0) {
		sections.push(
			'Held back on purpose (`scripts/dependencies/held-back.json`):',
			table(
				['Package', 'Current', 'Latest', 'Why', 'Recheck'],
				verdict.heldBack.map((entry) => [
					`\`${entry.package}\``,
					entry.current,
					entry.latest,
					entry.reason,
					entry.recheck
				])
			)
		);
	}
	if (problems.length > 0) {
		sections.push(
			'Problems with the held-back list:',
			problems.map((problem) => `- ${problem}`).join('\n')
		);
	}
	return sections.join('\n\n');
}

function table(headings: readonly string[], rows: readonly (readonly string[])[]): string {
	const line = (cells: readonly string[]): string =>
		`| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`;
	return [line(headings), line(headings.map(() => '---')), ...rows.map(line)].join('\n');
}

function publish(markdown: string): void {
	console.log(markdown);
	const summary = process.env['GITHUB_STEP_SUMMARY'];
	if (summary !== undefined && summary !== '') {
		appendFileSync(summary, `${markdown}\n`);
	}
}

process.exitCode = main() ? 0 : 1;
