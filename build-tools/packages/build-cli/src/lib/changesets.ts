import { VersionBumpType } from "@fluid-tools/version-tools";
import { Logger } from "@fluidframework/build-tools";
import { compareAsc, parseISO } from "date-fns";
import globby from "globby";
import matter from "gray-matter";
import { fstatSync } from "node:fs";

import { ReleasePackage } from "../releaseGroups";
import { Repository } from "./git";
import { getDisplayDate } from "./dates";

export interface ChangesetEntry {
	content: string;
	added?: Date;
}

function compareChangesetEntry(a: ChangesetEntry, b: ChangesetEntry) {
	if (a.added === undefined || b.added === undefined) {
		return 0;
	}
	return compareAsc(a.added, b.added);
}

/**
 *
 * @param dir - The directory containing changesets.
 * @param repo - A Repository
 * @param log - An optional logger.
 * @returns An object with the bumpt type and a map of packages to changeset entries.
 */
export async function loadChangesets(
	dir: string,
	log?: Logger,
): Promise<{
	type: VersionBumpType;
	map: Map<ReleasePackage, ChangesetEntry[]>;
	ordered: ChangesetEntry[];
}> {
	const repo = new Repository({ baseDir: dir });
	const changesetMap = new Map<ReleasePackage, ChangesetEntry[]>();
	const changesetFiles = await globby(["*.md", "!README.md"], { cwd: dir, absolute: true });
	const changesetEntries: ChangesetEntry[] = [];
	let changeType: VersionBumpType | undefined;
	let expectedType: VersionBumpType | undefined;

	const hadWarnings = new Set<string>();
	for (const file of changesetFiles) {
		// Get the date the changeset file was added to git.
		// eslint-disable-next-line no-await-in-loop
		const results = await repo.gitClient.log({ file, maxCount: 1, strictDate: true });
		const added = parseISO(results.all[0].date);

		// Read the changeset file into content and metadata (front-matter)
		const md = matter.read(file);
		const content = md.content.trim();

		// changesetEntries should contain one entry per changeset file...
		changesetEntries.push({ content, added });

		// ...while the map contains the entries as they apply to each released package.
		for (const [pkgName, type] of Object.entries(md.data)) {
			if (changeType === undefined) {
				changeType = type;
				log?.verbose(`${file}: Found ${changeType} bump type; expecting all others to match.`);
			}

			if (type !== changeType && !hadWarnings.has(file)) {
				log?.warning(
					`Unexpected change type in ${file}: ${type} (expected ${changeType}). Check the changeset.`,
				);
				hadWarnings.add(file);
			}

			const entries = changesetMap.get(pkgName) ?? [];
			entries.push({ content, added });
			changesetMap.set(pkgName, entries);
		}
	}

	// Sort all the entries by date
	changesetEntries.sort(compareChangesetEntry);
	for (const entries of changesetMap.values()) {
		entries.sort(compareChangesetEntry);
	}

	if (changeType === undefined) {
		throw new Error(`No change type found.`);
	}

	return { type: changeType, map: changesetMap, ordered: changesetEntries };
}
