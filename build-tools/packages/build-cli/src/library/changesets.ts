/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { VersionBumpType } from "@fluid-tools/version-tools";
import { Logger, type ReleaseNotesSection } from "@fluidframework/build-tools";
import { compareAsc, formatISO, parseISO } from "date-fns";
import globby from "globby";
import matter from "gray-matter";
const { test: hasFrontMatter } = matter;

import { readFile } from "node:fs/promises";
import { ReleasePackage } from "../releaseGroups.js";
import { Repository } from "./git.js";

export const DEFAULT_CHANGESET_PATH = ".changeset";

/**
 * The section name used for changesets that do not match any defined sections.
 */
export const UNKNOWN_SECTION = "_unknown";

export interface FluidCustomChangesetMetadata {
	section?: ReleaseNotesSection["name"];
	includeInReleaseNotes?: boolean;
}

export interface Changeset {
	metadata: { [pkg: string]: VersionBumpType };
	mainPackage: ReleasePackage;
	changeTypes: VersionBumpType[];
	content: string;
	summary?: string;
	added?: Date;
	additionalMetadata?: FluidCustomChangesetMetadata;
	sourceFile: string;
}

/**
 * A ChangesetEntry is an object containing flattened content and file metadata from a changesets file. Changeset files
 * themselves include a mapping of package to version bump type. This object includes the change type and a single
 * package, effectively flattening the changesets.
 */
export type ChangesetEntry = Omit<Changeset, "metadata" | "mainPackage" | "changeTypes"> & {
	pkg: string;
	isMainPackage: boolean;
	changeType: VersionBumpType;
	fullChangeset: Readonly<Changeset>;
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
		log?.verbose(`Loading changeset: ${file}`);

		// Get the date the changeset file was added to git.
		// eslint-disable-next-line no-await-in-loop
		const results = await repo.gitClient.log({ file, strictDate: true });

		// Newly added files won't have any results from git log, so default to now.
		const added = parseISO(results.all?.at(-1)?.date ?? formatISO(Date.now()));

		// Read the changeset file into content and metadata (front-matter)
		// eslint-disable-next-line no-await-in-loop
		const rawFileContent = await readFile(file, { encoding: "utf8" });

		// Parse out the first layer of metadata, which is the package --> change type mapping.
		const firstParse = matter(rawFileContent);
		const packageBumpTypeMetadata = firstParse.data;

		// If there is a second frontmatter section, parse it as the additional metadata.
		const hasAdditionalMetadata = hasFrontMatter(firstParse.content);

		let markdownContent: string;
		let additionalMetadata: FluidCustomChangesetMetadata | undefined;
		if (hasAdditionalMetadata) {
			const secondParse = matter(firstParse.content);
			additionalMetadata = secondParse.data;
			markdownContent = secondParse.content.trim();
		} else {
			markdownContent = firstParse.content.trim();
		}

		const paragraphs = markdownContent.trim().split("\n\n");

		if (paragraphs.length < 2) {
			log?.warning(`No changeset content found in ${file}. Skipping!`);
			continue;
		}

		const summary = paragraphs[0];
		const content = paragraphs.slice(1).join("\n\n");

		const newChangeset: Changeset = {
			metadata: packageBumpTypeMetadata,
			mainPackage: Object.keys(packageBumpTypeMetadata)[0],
			additionalMetadata,
			content,
			added,
			summary,
			sourceFile: file,
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			changeTypes: [...new Set(Object.values(packageBumpTypeMetadata))],
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
export function groupByPackage(changesets: Changeset[]): Map<ReleasePackage, Changeset[]> {
	const changesetMap = new Map<ReleasePackage, Changeset[]>();
	const flattened = flattenChangesets(changesets);
	for (const changeset of flattened) {
		const entries = changesetMap.get(changeset.pkg) ?? [];
		entries.push(changeset.fullChangeset);
		changesetMap.set(changeset.pkg, entries);
	}

	// Sort all the entries by date
	for (const entries of changesetMap.values()) {
		entries.sort(compareChangesets);
	}

	return changesetMap;
}

/**
 * Creates a map of package names to an array of all the changesets that apply to the package. Only the "main" package
 * is considered. The returned array of changesets is sorted oldest-to-newest (that is, index 0 is the earliest
 * changeset, and the last changeset in the array is the newest).
 *
 * @param changesets - An array of changesets to be grouped.
 * @returns a Map of package names to an array of all the changesets that apply to the package.
 */
export function groupByMainPackage(changesets: Changeset[]): Map<ReleasePackage, Changeset[]> {
	const changesetMap = new Map<ReleasePackage, Changeset[]>();
	for (const changeset of changesets) {
		const entries = changesetMap.get(changeset.mainPackage) ?? [];
		entries.push(changeset);
		changesetMap.set(changeset.mainPackage, entries);
	}

	// Sort all the entries by date
	for (const entries of changesetMap.values()) {
		entries.sort(compareChangesets);
	}

	return changesetMap;
}

/**
 * Creates a map of section names to an array of all the changesets that belong in that section.
 *
 * The returned array of changesets are sorted oldest-to-newest (that is, index 0 is the earliest changeset, and the
 * last changeset in the array is the newest).
 *
 * Any changesets that do not belong to a section will be in the {@link UNKNOWN_SECTION} (`_unknown`) key in the
 * returned map, so callers should check the contents of that key to ensure all changesets were mapped to sections as
 * expected.
 *
 * Note that this groups by the section values in the changesets. Callers are expected to validate tha section names or
 * adjust them depending on their needs. This function does not adjust section names _except_ for those with no
 * specified section.
 *
 * @param changesets - An array of changesets to be grouped.
 * @returns a Map of section names to an array of all the changesets that apply to that section.
 */
export function groupBySection(
	changesets: Changeset[],
): Map<ReleaseNotesSection["name"], Changeset[]> {
	const changesetMap = new Map<ReleaseNotesSection["name"], Changeset[]>();
	for (const changeset of changesets) {
		const section = changeset.additionalMetadata?.section ?? UNKNOWN_SECTION;
		const entries = changesetMap.get(section) ?? [];
		entries.push(changeset);
		changesetMap.set(section, entries);
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
		let index = 0;
		for (const [pkg, changeType] of Object.entries(metadata)) {
			entries.push({
				pkg,
				isMainPackage: index === 0,
				changeType,
				content,
				summary,
				added,
				sourceFile,
				fullChangeset: changeset,
			});
			index++;
		}
	}

	return entries;
}
