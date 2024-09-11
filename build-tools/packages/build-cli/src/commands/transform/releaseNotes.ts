/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";
import { Flags } from "@oclif/core";
import { format as prettier } from "prettier";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkGithub, { defaultBuildUrl } from "remark-github";
import admonitions from "remark-github-beta-blockquote-admonitions";
import remarkToc from "remark-toc";

import { BaseCommand } from "../../library/index.js";
import {
	addHeadingLinks,
	removeHeadingsAtLevel,
	removeSectionContent,
	stripSoftBreaks,
	updateTocLinks,
	// eslint-disable-next-line import/no-internal-modules
} from "../../library/markdown.js";
// eslint-disable-next-line import/no-internal-modules
import { RELEASE_NOTES_TOC_LINK_TEXT } from "../../library/releaseNotes.js";

/**
 * Transforms a markdown release notes file into a format appropriate for use in a GitHub Release.
 */
export default class TransformReleaseNotesCommand extends BaseCommand<
	typeof TransformReleaseNotesCommand
> {
	static readonly summary =
		`Transforms a markdown release notes file into a format appropriate for use in a GitHub Release. This is used to transform in-repo release notes such that they can be automatically posted to our GitHub Releases.`;

	static readonly flags = {
		inFile: Flags.file({
			description: `A release notes file that was generated using 'flub generate releaseNotes'.`,
			required: true,
			exists: true,
		}),
		outFile: Flags.file({
			description: `Output the transformed content to this file.`,
			required: true,
		}),
		...BaseCommand.flags,
	} as const;

	static readonly examples = [
		{
			description: `Transform the release notes from version 2.2.0 and output the results to out.md.`,
			command:
				"<%= config.bin %> <%= command.id %> --inFile RELEASE_NOTES/2.2.0.md --outFile out.md",
		},
	];

	public async run(): Promise<string> {
		const { inFile, outFile } = this.flags;
		const input = await readFile(inFile, { encoding: "utf8" });
		const processor = remark()
			// Remove the H1 if it exists.
			.use(removeHeadingsAtLevel, { level: 1 })
			// Remove the existing TOC section because its links are incorrect; we'll regenerate it.
			.use(removeSectionContent, { heading: "Contents" })
			// Update the "back to TOC" links to prepend 'user-content-' because that's what GH Releases does.
			.use(updateTocLinks, {
				checkValue: RELEASE_NOTES_TOC_LINK_TEXT,
				newUrl: "#user-content-contents",
			})
			// Parse the markdown as GitHub-Flavored Markdown
			.use(remarkGfm)
			// Strip any single-line breaks. See the docs for the stripSoftBreaks function for more details.
			.use(stripSoftBreaks)
			// Parse any GitHub admonitions/alerts/callouts
			.use(admonitions, {
				titleTextMap: (title) => ({
					// By default the `[!` prefix and `]` suffix are removed; we don't want that, so we override the default and
					// return the title as-is.
					displayTitle: title,
					checkedTitle: title,
				}),
			})
			// Regenerate the TOC with the user-content- prefix.
			.use(remarkToc, {
				maxDepth: 3,
				skip: ".*Start Building Today.*",
				// Add the user-content- prefix to the links when we generate our own headingLinks, because GitHub will
				// prepend that to all our custom anchor IDs.
				prefix: "user-content-",
			})
			// Transform any issue and commit references into links.
			.use(remarkGithub, {
				buildUrl(values) {
					// Disable linking mentions
					return values.type === "mention" ? false : defaultBuildUrl(values);
				},
			})
			// Add custom anchor tags with IDs to all the headings.
			.use(addHeadingLinks);

		const contents = String(await processor.process(input));

		this.info(`Writing output file: ${outFile}`);
		await writeFile(
			outFile,
			await prettier(contents, { proseWrap: "never", parser: "markdown" }),
		);

		return contents;
	}
}
