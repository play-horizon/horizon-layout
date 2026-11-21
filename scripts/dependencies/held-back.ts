/**
 * The held-back list of the outdated check (`held-back.json`, next to this file), and the verdict
 * it gives on what `pnpm outdated` reports. `horizon-design` keeps the same file, in the same
 * shape and with the same rules, and the Horizon monorepo one section of it per ecosystem.
 *
 * The list names the direct dependencies kept below their newest version on purpose, each with why
 * (`reason`) and the day to look at it again (`recheck`, `YYYY-MM-DD`):
 *
 *     { "typescript": { "reason": "…", "recheck": "2027-01-21" } }
 *
 * A hold keeps a dependency off its next breaking release only: while no release newer than its
 * version is compatible with it (`^current`: the same major, or the same minor below 1.0), it
 * passes and is listed with its reason; a newer compatible release still fails the check. An entry
 * fails the check the day after its recheck day (UTC), so it is looked at again, and when it is
 * stale (its package has no newer version any more), so it is removed; so does a hold whose newest
 * compatible release can't be looked up.
 *
 * @module
 */

import { isRelease } from './versions.ts';

/** A dependency kept below its newest version on purpose. */
export interface HeldBack {
	readonly package: string;
	/** Why it is held back, as the report gives it. */
	readonly reason: string;
	/** The day (`YYYY-MM-DD`, UTC) after which the entry fails until it is looked at again. */
	readonly recheck: string;
}

/** A direct dependency with a newer version than the one the lockfile resolves. */
export interface Outdated {
	readonly name: string;
	readonly current: string;
	readonly latest: string;
}

/** A held-back dependency that has a newer, incompatible version. */
export interface HeldBackOutdated extends HeldBack {
	readonly current: string;
	readonly latest: string;
}

/** The verdict of the check. */
export interface Verdict {
	/** The outdated dependencies that aren't held back, and the held-back ones with a newer
	 * compatible release (as `latest`): each fails the check. */
	readonly outdated: readonly Outdated[];
	/** The outdated dependencies the list holds back: listed, not failing. */
	readonly heldBack: readonly HeldBackOutdated[];
	/** What is wrong with the list (a passed recheck day, a stale entry): each fails the check. */
	readonly problems: readonly string[];
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const fields = ['reason', 'recheck'];

/**
 * Parses the held-back list.
 *
 * @throws When `json` isn't an object of entries, each with a non-empty `reason`, a real
 * `recheck` day, and no other field.
 */
export function parseHeldBack(json: string): HeldBack[] {
	const entries = JSON.parse(json) as unknown;
	if (!isObject(entries)) {
		throw new Error('The held-back list must be an object of packages.');
	}
	return Object.entries(entries).map(([name, entry]) => parseEntry(name, entry));
}

/**
 * Judges `outdated` (from `pnpm outdated`) against the held-back list on the day `today`
 * (`YYYY-MM-DD`, UTC). `compatible` gives, for each held-back dependency that is outdated, its
 * newest release compatible with the current one (the current one when none is newer); one
 * missing from it (its lookup failed) fails the check, as its hold can't be checked.
 */
export function judge(
	outdated: readonly Outdated[],
	heldBack: readonly HeldBack[],
	today: string,
	compatible: ReadonlyMap<string, string>
): Verdict {
	const held = new Map(heldBack.map((entry) => [entry.package, entry]));
	const problems: string[] = [];
	for (const entry of heldBack) {
		if (entry.recheck < today) {
			problems.push(
				`${entry.package}: its recheck day, ${entry.recheck}, has passed. Check whether the ` +
					`reason still holds ("${entry.reason}"), then update the package or move the day.`
			);
		}
		if (!outdated.some((dependency) => dependency.name === entry.package)) {
			problems.push(`${entry.package} is held back but has no newer version: remove its entry.`);
		}
	}
	const stillOutdated: Outdated[] = [];
	const heldBackOutdated: HeldBackOutdated[] = [];
	for (const dependency of outdated) {
		const entry = held.get(dependency.name);
		if (entry === undefined) {
			stillOutdated.push(dependency);
			continue;
		}
		if (!isRelease(dependency.current) || !isRelease(dependency.latest)) {
			problems.push(
				`${dependency.name} can't be held back: its versions (${dependency.current}, ` +
					`${dependency.latest}) aren't release versions.`
			);
			stillOutdated.push(dependency);
			continue;
		}
		heldBackOutdated.push({ ...entry, current: dependency.current, latest: dependency.latest });
		const newestCompatible = compatible.get(dependency.name);
		if (newestCompatible === undefined) {
			problems.push(
				`${dependency.name}: its newest release compatible with ${dependency.current} couldn't ` +
					"be looked up, so the hold can't be checked."
			);
		} else if (newestCompatible !== dependency.current) {
			stillOutdated.push({ ...dependency, latest: newestCompatible });
		}
	}
	return { outdated: stillOutdated, heldBack: heldBackOutdated, problems };
}

function parseEntry(name: string, entry: unknown): HeldBack {
	const where = `The held-back package ${name}`;
	if (!isObject(entry)) {
		throw new Error(`${where} isn't an object.`);
	}
	const unknownFields = Object.keys(entry).filter((key) => !fields.includes(key));
	if (unknownFields.length > 0) {
		throw new Error(`${where} has unknown fields: ${unknownFields.join(', ')}.`);
	}
	const { reason, recheck } = entry;
	if (typeof reason !== 'string' || reason.trim() === '') {
		throw new Error(`${where} gives no reason.`);
	}
	if (typeof recheck !== 'string' || !isValidDate(recheck)) {
		throw new Error(`${where} has no recheck day (YYYY-MM-DD).`);
	}
	return { package: name, reason, recheck };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(text: string): boolean {
	if (!isoDate.test(text)) {
		return false;
	}
	// Date rolls an impossible day over (2026-02-30 is 2026-03-02), so the round trip tells.
	const date = new Date(`${text}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}
