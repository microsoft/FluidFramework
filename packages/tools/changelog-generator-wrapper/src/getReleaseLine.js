/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const changelogFunctions = require("changesets-format-with-issue-links");
const { remark } = require("remark");
const remarkGfm = require("remark-gfm").default;
const { visit } = require("unist-util-visit");

/**
 * The shallowest body heading level beneath a level-4 changeset title.
 */
const MINIMUM_BODY_HEADING_LEVEL = 5;

/**
 * Matches blank content after the enclosing container prefix has been removed.
 */
const BLANK_LINE_REGEX = /^[\t ]*$/;

/**
 * Checks for a blank line without mistaking indented quote characters in code for container markers.
 *
 * @param {string} line - The source line to inspect.
 * @param {string} prefix - The enclosing heading's list and blockquote continuation prefix.
 * @returns {boolean} Whether the line contains only whitespace within that container.
 */
function isBlankLine(line, prefix) {
	const containerPrefix = prefix.trimEnd();
	const content = line.startsWith(containerPrefix) ? line.slice(containerPrefix.length) : line;
	return BLANK_LINE_REGEX.test(content);
}

/**
 * Keeps inline HTML on one physical line without changing quoted attribute values.
 *
 * @remarks
 * HTML normalizes literal line endings to line feeds; character references preserve those values inside quoted attributes.
 *
 * @param {string} html - An inline HTML node's source.
 * @returns {string} HTML with tag-layout line endings replaced by spaces and quoted line feeds encoded as character references.
 */
function normalizeInlineHtml(html) {
	return html.replace(/"[^"]*"|'[^']*'|\r\n?|\n/g, (part) =>
		part.startsWith('"') || part.startsWith("'") ? part.replace(/\r\n?|\n/g, "&#10;") : " ",
	);
}

/**
 * Finds a closing fence needed to keep the final top-level code block from consuming the next changeset.
 *
 * @param {string} body - The unmodified changeset body.
 * @param {ReturnType<typeof remark.parse>} tree - The body parsed before any source replacements.
 * @returns {string | undefined} The missing closing fence, or undefined if the final block needs no closer.
 */
function getMissingClosingFence(body, tree) {
	const finalBlock = tree.children.at(-1);
	if (finalBlock?.type !== "code") {
		return undefined;
	}

	const start = finalBlock.position?.start.offset;
	const end = finalBlock.position?.end.offset;
	if (start === undefined || end === undefined) {
		throw new Error("Parsed changeset code blocks must have source positions.");
	}
	const lineStart = body.lastIndexOf("\n", start - 1) + 1;
	const source = body.slice(lineStart, end);

	// Inspect original indentation so an indented code line containing backticks is not treated as an opening fence.
	const openingFence = source.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
	const lastLineStart = source.lastIndexOf("\n");
	const closingFence =
		lastLineStart === -1
			? undefined
			: source.slice(lastLineStart + 1).match(/^ {0,3}(`{3,}|~{3,})[\t ]*$/)?.[1];
	if (openingFence !== undefined && !closingFence?.startsWith(openingFence)) {
		return openingFence;
	}
	return undefined;
}

/**
 * Finds a closing tag needed to keep the final top-level raw HTML block from consuming the next changeset.
 *
 * @param {ReturnType<typeof remark.parse>} tree - The body parsed before any source replacements.
 * @returns {string | undefined} The missing closing tag, or undefined if no raw HTML closer is needed.
 */
function getMissingHtmlClosingTag(tree) {
	const finalBlock = tree.children.at(-1);
	if (finalBlock?.type !== "html") {
		return undefined;
	}

	// Unlike ordinary HTML blocks, these blocks do not end at a blank line.
	// Inspect only parsed HTML so literal tags inside code examples remain unchanged.
	const tag = finalBlock.value.match(/^ {0,3}<(pre|script|style|textarea)(?=\s|>)/i)?.[1];
	if (tag === undefined) {
		return undefined;
	}
	const closingTag = `</${tag}>`;
	return finalBlock.value.toLowerCase().includes(closingTag.toLowerCase())
		? undefined
		: closingTag;
}

/**
 * Finds a closer needed to keep the final top-level code or raw HTML block from consuming the next changeset.
 *
 * @param {string} body - The unmodified changeset body.
 * @param {ReturnType<typeof remark.parse>} tree - The body parsed before any source replacements.
 * @returns {string | undefined} The missing fence or HTML closing tag, or undefined if no closer is needed.
 */
function getMissingBlockCloser(body, tree) {
	return getMissingClosingFence(body, tree) ?? getMissingHtmlClosingTag(tree);
}

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
 * Entries end with a newline.
 * EOF-open top-level code fences and `pre`, `script`, `style`, and `textarea` HTML blocks are closed before the next entry is appended.
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
		return `${title}\n`;
	}

	// Use GitHub-flavored Markdown so reserializing headings does not change autolink destinations or inline syntax.
	const processor = remark().use(remarkGfm);

	// Preserve the body's blank lines and indentation, which can be significant in Markdown code blocks.
	let body = bodyLines.join("\n");
	const tree = processor.parse(body);

	// Fenced code and raw HTML may end at EOF in a standalone changeset.
	// Record a missing closer before heading replacements change source offsets; the combined changelog has no per-entry EOF.
	const missingBlockCloser = getMissingBlockCloser(body, tree);
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

			// Physical newlines in code spans or HTML would split an ATX heading or lose its container prefix.
			visit(node, ["inlineCode", "html"], (inline) => {
				if (inline.type === "html") {
					inline.value = normalizeInlineHtml(inline.value);
				} else if (inline.type === "inlineCode") {
					inline.value = inline.value.replace(/\r\n?|\n/g, " ");
				}
			});

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
					if (!isBlankLine(previousLine, prefix)) {
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
					if (!isBlankLine(nextLine, prefix)) {
						text += `\n${prefix}`;
					}
				}
			}
			body = body.slice(0, start) + text + body.slice(end);
		},
		true,
	);

	// Close an EOF-open block on its own line so it cannot absorb the next changeset's heading or formatting.
	if (missingBlockCloser !== undefined) {
		body += `${body.endsWith("\n") ? "" : "\n"}${missingBlockCloser}`;
	}

	// Changesets joins entries with one newline. Supply another for HTML blocks that end at blank lines.
	return `${title}\n${body}${body.endsWith("\n") ? "" : "\n"}`;
};

exports.getReleaseLine = getReleaseLine;
