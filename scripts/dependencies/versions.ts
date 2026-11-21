/**
 * Semantic versions as npm writes them (`1.2.3`, `1.2.3-rc.1`), compared by their numbers: what
 * the outdated check (`held-back.ts`, `pnpm-outdated.ts`) needs to tell whether a version is newer
 * than the one the lockfile resolves, and whether it is compatible with it.
 *
 * @module
 */

const releasePattern = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/** The version numbers of a release, without pre-release identifiers or build metadata. */
export interface Release {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	/** Whether it is a pre-release (`1.0.0-rc.1`). */
	readonly isPrerelease: boolean;
}

/** Whether `text` is a semantic version `parseRelease` reads. */
export function isRelease(text: string): boolean {
	return releasePattern.test(text);
}

/**
 * Parses a version (`1.2.3`, `1.2.3-rc.1`, `1.2.3+build.5`).
 *
 * @throws When `version` isn't a semantic version.
 */
export function parseRelease(version: string): Release {
	const match = releasePattern.exec(version);
	if (match === null) {
		throw new Error(`${version} isn't a semantic version.`);
	}
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		isPrerelease: match[4] !== undefined
	};
}

/**
 * Whether the stable release `latest` is newer than `current`: its numbers are higher, or the
 * same while `current` is a pre-release of it.
 */
export function isNewer(latest: Release, current: Release): boolean {
	const order =
		latest.major - current.major || latest.minor - current.minor || latest.patch - current.patch;
	return order > 0 || (order === 0 && current.isPrerelease);
}

/**
 * Whether `candidate` is compatible with `current` by npm's caret rule: the same major version, or
 * for a `0.y` version the same minor, or for `0.0.z` the same patch.
 */
export function isCompatible(candidate: Release, current: Release): boolean {
	if (current.major > 0) {
		return candidate.major === current.major;
	}
	if (current.minor > 0) {
		return candidate.major === 0 && candidate.minor === current.minor;
	}
	return candidate.major === 0 && candidate.minor === 0 && candidate.patch === current.patch;
}

/**
 * The newest stable version of `versions` compatible with `current` (`isCompatible`), or
 * `current` itself when none is newer.
 *
 * @throws When a version isn't a semantic version.
 */
export function newestCompatible(versions: readonly string[], current: string): string {
	const base = parseRelease(current);
	let newest = { version: current, release: base };
	for (const version of versions) {
		const release = parseRelease(version);
		if (!release.isPrerelease && isCompatible(release, base) && isNewer(release, newest.release)) {
			newest = { version, release };
		}
	}
	return newest.version;
}
