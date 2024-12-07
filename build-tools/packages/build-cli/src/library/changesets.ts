/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { VersionBumpType } from "@fluid-tools/version-tools";
import { Logger } from "@fluidframework/build-tools";
import { compareAsc, formatISO, parseISO } from "date-fns";
import globby from "globby";
import matter from "gray-matter";
import issueParser from "issue-parser";
import { simpleGit } from "simple-git";
const { test: hasFrontMatter } = matter;

import type { ReleaseNotesSectionName } from "../config.js";
import { ReleasePackage } from "../releaseGroups.js";

export const DEFAULT_CHANGESET_PATH = ".changeset";

/**
 * The section name used for changesets that do not match any defined sections.
 */
export const UNKNOWN_SECTION = "_unknown";

/**
 * Additional metadata that can be used inside a changeset. This metadata should be set in a second front matter
 * section.
 * @example
 *
 * ```markdown
 * ---
 * "package-a": minor
 * ---
 * ---
 * section: fix
 * ---
 *
 * Changeset summary.
 *
 * Changeset details
 * ```
 */
export interface FluidCustomChangesetMetadata {
	/**
	 * The section in release notes in which this changeset should be included. If a value is not provided, the changeset
	 * is considered part of the "unknown section".
	 */
	section?: ReleaseNotesSectionName;

	/**
	 * If false, the changeset will not be included in release notes.
	 *
	 * @defaultValue `true`
	 */
	includeInReleaseNotes?: boolean;

	/**
	 * If true, the changeset will be ordered before the other changes in that section. If multiple changesets are
	 * highlighted they will be internally sorted by date.
	 *
	 * @defaultValue `false`
	 */
	highlight?: boolean;
}

/**
 * A utility type that makes all the keys in a type required, but allows those keys to be set to undefined explicitly.
 * This is useful when creating objects that are the "default values" for an interface. If you want to ensure there are
 * explicit defaults for every value in the interface, this type ensures that at compile time.
 */
type RequiredKeysAllowUndefined<T> = {
	[K in keyof T]: T[K] | undefined;
};

/**
 * Default values used when additional changeset metadata is omitted.
 */
export const fluidCustomChangeSetMetadataDefaults: RequiredKeysAllowUndefined<
	Required<FluidCustomChangesetMetadata>
> = {
	section: undefined,
	includeInReleaseNotes: true,
	highlight: false,
} as const;

/**
 * A type representing a changeset file's contents.
 */
export interface Changeset {
	/**
	 * The first section of front matter in the changeset, which is a mapping of package names to release types.
	 */
	metadata: { [pkg: string]: VersionBumpType };

	/**
	 * The main package for the changeset is the first one listed in the front matter.
	 */
	mainPackage: ReleasePackage;

	/**
	 * An array of all the release types (patch, minor, major) contained in the front matter.
	 */
	changeTypes: VersionBumpType[];

	/**
	 * The first markdown paragraph of the changeset is considered the summary.
	 */
	summary: string;

	/**
	 * The body of the changeset after processing. Front matter sections are removed and white space is trimmed from the
	 * beginning and end of the string. Note that the first markdown paragraph of the changeset is not considered
	 * part of the body; it's the summary.
	 */
	body: string;

	/**
	 * The git commit that added the changeset. For uncommitted changesets some commit data may be undefined.
	 */
	commit: GitCommit;

	/**
	 * Additional Fluid-specific metadata that can be added to a changeset in a secondary front matter section. This is
	 * undefined if no second front matter section was present.
	 */
	additionalMetadata?: FluidCustomChangesetMetadata;

	/**
	 * The absolute path to the source file for this changeset.
	 */
	sourceFile: string;
}

/**
 * A git commit associated with a changeset. If the changeset is not committed (i.e. it's being added in the current
 * changes) then some values will be undefined.
 */
interface GitCommit {
	/**
	 * The full SHA for the commit. This will be undefined for uncommitted changesets.
	 */
	sha?: string;

	/**
	 * The date that the commit was made. This is not nullable because uncommitted changesets still need to be sortable by
	 * commit date, so this value will default to `Date.now()` in ISO format for uncommitted changesets.
	 */
	date: Date;

	/**
	 * The GitHub pull request number parsed from the commit data. This will be undefined if the parsing did not find a
	 * PR.
	 */
	githubPullRequest?: string;
}

/**
 * A ChangesetEntry is an object containing flattened content and file metadata from a changesets file. Changeset files
 * themselves include a mapping of package to version bump type. This object includes the change type and a single
 * package, effectively flattening the changesets.
 */
export type ChangesetEntry = Omit<Changeset, "metadata" | "mainPackage" | "changeTypes"> & {
	/**
	 * The name of the package this ChangesetEntry applies to.
	 */
	pkg: string;

	/**
	 * This will be true if the package in this ChangesetEntry is the main package for the changeset.
	 */
	isMainPackage: boolean;

	/**
	 * The type of release this changeset represents.
	 */
	changeType: VersionBumpType;

	/**
	 * The original full changeset that was the source for this ChangesetEntry.
	 */
	fullChangeset: Readonly<Changeset>;
};

/**
 * Compares two changesets by the highlight property of additional metadata if present, then by commit date.
 */
function compareChangesets<T extends Pick<Changeset, "commit" | "additionalMetadata">>(
	a: T,
	b: T,
): number {
	// Sort highlighted items to the top;
	if (a.additionalMetadata?.highlight === true && b.additionalMetadata?.highlight !== true) {
		return -1;
	}
	if (a.additionalMetadata?.highlight !== true && b.additionalMetadata?.highlight === true) {
		return 1;
	}

	// Finally sort by date
	if (a.commit?.date === undefined || b.commit?.date === undefined) {
		return 0;
	}
	return compareAsc(a.commit?.date, b.commit?.date);
}

/**
 * Loads changeset files into an array of {@link Changeset}s.
 *
 * @param dir - The directory containing changesets.
 * @param log - An optional logger.
 * @returns An array containing the changesets.
 */
export async function loadChangesets(dir: string, log?: Logger): Promise<Changeset[]> {
	const repo = simpleGit({ baseDir: dir });
	const changesetFiles = await globby(["*.md", "!README.md"], { cwd: dir, absolute: true });
	const changesets: Changeset[] = [];

	for (const file of changesetFiles) {
		log?.verbose(`Loading changeset: ${file}`);

		// Get the date the changeset file was added to git.
		// eslint-disable-next-line no-await-in-loop
		const results = await repo.log({ file, strictDate: true });
		// git log returns commits ordered newest -> oldest, so we want the last item, which is the earliest commit
		const rawCommit = results.all?.at(-1);
		const pullRequest =
			rawCommit?.message === undefined ? undefined : parseGitHubPRs(rawCommit.message);

		const commit: GitCommit = {
			// Newly added files won't have any results from git log, so default to now.
			date: parseISO(rawCommit?.date ?? formatISO(Date.now())),
			sha: rawCommit?.hash,
			githubPullRequest: pullRequest?.issue,
		};

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
		const body = paragraphs.slice(1).join("\n\n");

		const newChangeset: Changeset = {
			metadata: packageBumpTypeMetadata,
			mainPackage: Object.keys(packageBumpTypeMetadata)[0],
			additionalMetadata,
			body,
			summary,
			sourceFile: file,
			commit,
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

	// Sort all the entries by highlighted status and date
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
export function groupByMainPackage(
	changesets: Changeset[],
): ReadonlyMap<ReleasePackage, Changeset[]> {
	const changesetMap = new Map<ReleasePackage, Changeset[]>();
	for (const changeset of changesets) {
		const entries = changesetMap.get(changeset.mainPackage) ?? [];
		entries.push(changeset);
		changesetMap.set(changeset.mainPackage, entries);
	}

	// Sort all the entries by highlighted status and date
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
): ReadonlyMap<ReleaseNotesSectionName, Changeset[]> {
	const changesetMap = new Map<ReleaseNotesSectionName, Changeset[]>();
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
 * Given an array of changesets, flattens the changesets into an array of {@link ChangesetEntry} objects.
 *
 * Changesets themselves include a mapping of package to release type. This function returns an array with an entry
 * per-package-changeset, effectively flattening the changesets.
 */
export function flattenChangesets(
	changesets: readonly Changeset[],
): readonly ChangesetEntry[] {
	const entries: ChangesetEntry[] = [];

	for (const changeset of changesets) {
		const { body, summary, commit, sourceFile, metadata } = changeset;
		let index = 0;
		for (const [pkg, changeType] of Object.entries(metadata)) {
			entries.push({
				pkg,
				isMainPackage: index === 0,
				changeType,
				body,
				summary,
				commit,
				sourceFile,
				fullChangeset: changeset,
			});
			index++;
		}
	}

	return entries;
}

const gitHubParser = issueParser("github");

/**
 * Parses a string and returns the first GitHub issue reference found.
 *
 * @param content - The string to check for PR/issue numbers.
 */
function parseGitHubPRs(content: string): issueParser.Reference {
	const { refs } = gitHubParser(content);
	return refs[0];
}
