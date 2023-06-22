/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { VersionBumpType } from "@fluid-tools/version-tools";
import { Logger } from "@fluidframework/build-tools";
import { compareAsc, parseISO } from "date-fns";
import globby from "globby";
import matter from "gray-matter";

import { ReleasePackage } from "../releaseGroups";
import { Repository } from "./git";

export const DEFAULT_CHANGESET_PATH = ".changeset";

/**
 * A ChangesetEntry is an object containing flattened content and file metadata from a changesets file. Changeset files
 * themselves include a mapping of package to version bump type. This object includes the change type and a single
 * package, effectively flattening the changesets.
 */
export interface ChangesetEntry {
	pkg: string;
	changeType: VersionBumpType;
	content: string;
	summary?: string;
	added?: Date;
}

function compareChangesetEntry(a: ChangesetEntry, b: ChangesetEntry) {
	if (a.added === undefined || b.added === undefined) {
		return 0;
	}
	return compareAsc(a.added, b.added);
}

/**
 * @param dir - The directory containing changesets.
 * @param log - An optional logger.
 * @returns An object with the bumpt type and a map of packages to changeset entries.
 */
export async function loadChangesets(dir: string, log?: Logger): Promise<ChangesetEntry[]> {
	const repo = new Repository({ baseDir: dir });
	const changesetFiles = await globby(["*.md", "!README.md"], { cwd: dir, absolute: true });
	const changesetEntries: ChangesetEntry[] = [];

	for (const file of changesetFiles) {
		// Get the date the changeset file was added to git.
		// eslint-disable-next-line no-await-in-loop
		const results = await repo.gitClient.log({ file, maxCount: 1, strictDate: true });
		const added = parseISO(results.all[0].date);

		// Read the changeset file into content and metadata (front-matter)
		const md = matter.read(file);
		const paragraphs = md.content.trim().split("\n\n");

		if (paragraphs.length < 2) {
			log?.warning(`No changeset content found in ${file}. Skipping!`);
			continue;
		}

		const summary = paragraphs[0];
		const content = paragraphs.slice(1).join("\n\n");

		// ...while the map contains the entries as they apply to each released package.
		for (const [pkgName, changeType] of Object.entries(md.data)) {
			changesetEntries.push({
				pkg: pkgName,
				content,
				added,
				summary,
				changeType,
			});
		}
	}

	// Sort all the entries by date
	changesetEntries.sort(compareChangesetEntry);

	return changesetEntries;
}

/**
 * Creates a map of package names to an array of all the changesets that apply to the package. The entries are sorted
 * oldest-to-newest (that is, index 0 is the earliest changeset, and the last changeset in the array is the newest).
 *
 * @param changesets - An array of changesets to be grouped.
 * @returns a Map of package names to an array of all the changesets that apply to the package.
 */
export function groupByPackage(
	changesets: ChangesetEntry[],
): Map<ReleasePackage, ChangesetEntry[]> {
	const changesetMap = new Map<ReleasePackage, ChangesetEntry[]>();
	for (const changeset of changesets) {
		const entries = changesetMap.get(changeset.pkg) ?? [];
		entries.push(changeset);
		changesetMap.set(changeset.pkg, entries);
	}

	// Sort all the entries by date
	for (const entries of changesetMap.values()) {
		entries.sort(compareChangesetEntry);
	}

	return changesetMap;
}
