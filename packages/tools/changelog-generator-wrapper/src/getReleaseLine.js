/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const changelogFunctions = require("changesets-format-with-issue-links");
const { remark } = require("remark");
const { visit } = require("unist-util-visit");

/**
 * The shallowest body heading level beneath a level-4 changeset title.
 */
const MINIMUM_BODY_HEADING_LEVEL = 5;

/**
 * Matches a blank line, including blockquote continuation markers.
 */
const BLANK_LINE_REGEX = /^[\t >]*$/;

/* eslint-disable tsdoc/syntax -- JavaScript type annotations use JSDoc syntax. */

/**
 * Formats a changeset as a package changelog entry with a level-4 title.
 *
 * @remarks
 * Package changelogs reserve heading levels 1-3 for the package, version, and change category.
 * Each changeset gets its own level-4 heading so its body headings cannot appear to contain subsequent entries.
 * The shallowest body heading becomes level 5, and all other body headings receive the same offset.
 * This preserves relative nesting regardless of the heading levels used in the changeset.
 * Headings whose adjusted levels exceed 6 become bold labels because Markdown does not support deeper headings.
 * These labels retain paragraph boundaries and enclosing list or blockquote prefixes so adjacent content remains separate.
 *
 * @param changeset - The source changeset.
 * Its `summary` property contains the full Markdown content, including the title and body.
 * @param type - The version bump type supplied by Changesets and forwarded to the underlying formatter.
 * @param options - Options passed to the underlying formatter, such as the repository URL and link templates.
 * The `changesetTemplate` option is overridden to render the title as a heading.
 * @returns The entry's Markdown, with PR and commit links when the formatter can resolve them.
 *
 * @type {typeof import("changesets-format-with-issue-links").default.getReleaseLine}
 */
/* eslint-enable tsdoc/syntax */
const getReleaseLine = async (changeset, type, options) => {
	const [summary, ...bodyLines] = changeset.summary.split(/\r?\n/);

	// Delegate PR and commit link discovery to the existing formatter, but give it only the title.
	// Otherwise its default list-item indentation would also be applied to the body.
	const title = await changelogFunctions.default.getReleaseLine(
		{ ...changeset, summary },
		type,
		{
			...options,
			changesetTemplate: "#### $changesetTitle$issue$commit",
		},
	);
	if (bodyLines.length === 0) {
		return title;
	}

	const processor = remark();

	// Preserve the body's blank lines and indentation, which can be significant in Markdown code blocks.
	let body = bodyLines.join("\n");
	const tree = processor.parse(body);
	let shallowestDepth = 6;

	// Find the shallowest heading across the whole body, not just the first heading encountered.
	// Code examples do not contain heading nodes, so any hash-prefixed lines in code blocks will be ignored.
	visit(tree, "heading", (node) => {
		shallowestDepth = Math.min(shallowestDepth, node.depth);
	});
	const offset = MINIMUM_BODY_HEADING_LEVEL - shallowestDepth;

	// Replace only heading ranges to avoid reformatting the rest of the document.
	// Visit in reverse document order so replacements do not invalidate remaining source positions.
	visit(
		tree,
		"heading",
		(node, index) => {
			const start = node.position?.start.offset;
			const end = node.position?.end.offset;
			if (start === undefined || end === undefined || index === undefined) {
				throw new Error(
					"Parsed changeset headings must have source positions and a parent index.",
				);
			}

			// Apply the same offset even when source heading levels are skipped.
			// Preserve their inline children so links, code spans, and emphasis survive the conversion.
			// The stringifier expects a document root even though only one replacement node is being rendered.
			const depth = node.depth + offset;
			const replacement = processor.stringify({
				type: "root",
				children:
					// Render headings deeper than level 6 as bold paragraphs, since Markdown only supports heading levels 1-6.
					depth > 6
						? [
								{
									type: "paragraph",
									children:
										// An empty strong node would produce "****", which Markdown reads as a thematic break.
										node.children.length === 0
											? []
											: [{ type: "strong", children: node.children }],
								},
							]
						: [
								{
									...node,
									depth: depth === MINIMUM_BODY_HEADING_LEVEL ? MINIMUM_BODY_HEADING_LEVEL : 6,
								},
							],
			});

			// Keep existing line breaks for headings, but give bold labels the blank lines that paragraphs require.
			let text = replacement.trimEnd();
			if (depth > 6 && text !== "") {
				const lineStart = body.lastIndexOf("\n", start - 1) + 1;

				// Repeat quote markers and indentation on inserted lines, replacing list markers with continuation spaces.
				// A bare blank line or an unindented label could otherwise split the enclosing quote or list item.
				const prefix = body.slice(lineStart, start).replace(/[^\t >]/g, " ");
				if (index > 0 && lineStart > 0) {
					const previousLineStart = body.lastIndexOf("\n", lineStart - 2) + 1;
					const previousLine = body.slice(previousLineStart, lineStart - 1);
					if (!BLANK_LINE_REGEX.test(previousLine)) {
						text = `\n${prefix}${text}`;
					}
				}

				const nextLineStart = body.indexOf("\n", end);
				if (nextLineStart !== -1) {
					const nextLineEnd = body.indexOf("\n", nextLineStart + 1);
					const nextLine = body.slice(
						nextLineStart + 1,
						nextLineEnd === -1 ? body.length : nextLineEnd,
					);
					if (!BLANK_LINE_REGEX.test(nextLine)) {
						text += `\n${prefix}`;
					}
				}
			}
			body = body.slice(0, start) + text + body.slice(end);
		},
		true,
	);

	return `${title}\n${body}`;
};

exports.getReleaseLine = getReleaseLine;
