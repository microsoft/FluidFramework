/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { VersionBumpType } from "@fluid-tools/version-tools";
import { Logger } from "@fluidframework/build-tools";
import { compareAsc, formatISO, parseISO } from "date-fns";
import globby from "globby";
import matter from "gray-matter";

import { ReleasePackage } from "../releaseGroups.js";
import { Repository } from "./git.js";

export const DEFAULT_CHANGESET_PATH = ".changeset";

export interface Changeset {
	metadata: { [pkg: string]: VersionBumpType };
	changeTypes: VersionBumpType[];
	content: string;
	summary?: string;
	added?: Date;
	sourceFile: string;
}

/**
 * A ChangesetEntry is an object containing flattened content and file metadata from a changesets file. Changeset files
 * themselves include a mapping of package to version bump type. This object includes the change type and a single
 * package, effectively flattening the changesets.
 */
export type ChangesetEntry = Omit<Changeset, "metadata" | "changeTypes"> & {
	pkg: string;
	changeType: VersionBumpType;
};

function compareChangesets<T extends Pick<Changeset, "added">>(a: T, b: T): number {
	if (a.added === undefined || b.added === undefined) {
		return 0;
	}
	return compareAsc(a.added, b.added);
}

/**
 * Loads changeset files into a list of individual changes for a package. Changeset files themselves include a mapping
 * of package to version bump type. This function returns an array with an entry per-package-changeset, effectively
 * flattening the changesets.
 *
 * @param dir - The directory containing changesets.
 * @param log - An optional logger.
 * @returns An array containing the flattened changesets.
 */
export async function loadChangesets(dir: string, log?: Logger): Promise<Changeset[]> {
	const repo = new Repository({ baseDir: dir });
	const changesetFiles = await globby(["*.md", "!README.md"], { cwd: dir, absolute: true });
	const changesets: Changeset[] = [];

	for (const file of changesetFiles) {
		// Get the date the changeset file was added to git.
		// eslint-disable-next-line no-await-in-loop
		const results = await repo.gitClient.log({ file, maxCount: 1, strictDate: true });

		// Newly added files won't have any results from git log, so default to now.
		const added = parseISO(results.all?.[0]?.date ?? formatISO(Date.now()));

		// Read the changeset file into content and metadata (front-matter)
		const md = matter.read(file);
		const paragraphs = md.content.trim().split("\n\n");

		if (paragraphs.length < 2) {
			log?.warning(`No changeset content found in ${file}. Skipping!`);
			continue;
		}

		const summary = paragraphs[0];
		const content = paragraphs.slice(1).join("\n\n");

		const newChangeset: Changeset = {
			metadata: md.data,
			content,
			added,
			summary,
			sourceFile: file,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			changeTypes: [...new Set(Object.values(md.data))],
		};

		changesets.push(newChangeset);
		if (newChangeset.changeTypes.length > 1) {
			log?.warning(
				`Changeset ${path.basename(file)} contains multiple change types. Is this expected?`,
			);
		}
	}

	// Sort all the entries by date
	changesets.sort(compareChangesets);

	return changesets;
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
		entries.sort(compareChangesets);
	}

	return changesetMap;
}

/**
 * Given an array of changesets, flattens the changesets into an array of ChangesetEntry objects.
 */
export function flattenChangesets(changesets: Changeset[]): ChangesetEntry[] {
	const entries: ChangesetEntry[] = [];

	for (const changeset of changesets) {
		const { content, summary, added, sourceFile, metadata } = changeset;
		for (const [pkg, changeType] of Object.entries(metadata)) {
			entries.push({
				pkg,
				changeType,
				content,
				summary,
				added,
				sourceFile,
			});
		}
	}

	return entries;
}
