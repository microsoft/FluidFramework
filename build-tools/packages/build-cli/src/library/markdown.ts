/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import GithubSlugger from "github-slugger";
import type { Heading, Html, Link, Root } from "mdast";
import { headingRange } from "mdast-util-heading-range";
import { toString } from "mdast-util-to-string";
import type { Node, Parent } from "unist";
import { SKIP, visit } from "unist-util-visit";

/**
 * Using the same instance for all slug generation ensures that no duplicate IDs are generated.
 */
const slugger = new GithubSlugger();

/**
 * A remarkjs/unist plugin that inserts HTML anchor nodes before heading text. This is a workaround for GitHub's lack of
 * automatic heading links in GitHub Releases. GitHub's markdown rendering is inconsistent, and in this case it does not
 * add automatic links.
 *
 * For more details, see: https://github.com/orgs/community/discussions/48311#discussioncomment-10436184
 */
export function addHeadingLinks(): (tree: Node) => void {
	return (tree: Node): void => {
		visit(tree, "heading", (node: Heading) => {
			if (
				node.children?.length > 0 &&
				// This check ensures that we don't add links to headings that already have them. In such cases the first child
				// node's type will be html, not text. Note that this check could ignore some node types other than text that
				// would be fine to add headings to, but we've not come across any such cases.
				node.children[0].type === "text"
			) {
				// Calling toString on the whole node ensures that embedded nodes (e.g. formatted text in the heading) are
				// included in the slugged string.
				const slug = slugger.slug(toString(node));
				// We need to insert an Html node instead of a string, because raw
				// strings will get markdown-escaped when rendered
				const htmlNode: Html = {
					type: "html",
					value: `<a id="${slug}"></a>`,
				};
				// Insert the HTML node as the first child node of the heading
				node.children.unshift(htmlNode);
			}
		});
	};
}

/**
 * A regular expression to remove single line breaks from text. This is used to remove extraneous line breaks in text
 * nodes in markdown. This is useful because GitHub sometimes renders single line breaks, and sometimes it ignores them
 * like the CommonMark spec describes. Removing them ensures that markdown renders as expected across GitHub.
 *
 * The regular expression is tricky to understand but battle-tested in
 * https://github.com/ghalactic/github-release-from-tag
 *
 * The `$` in the `[^$]` piece could be replaced with almost any character (`&` for example), because it's interpreted
 * literally in the brackets. So the regex essentially finds the end of lines then captures another single character
 * that isn't the literal `$` - which would be the newline itself.
 */
const SOFT_BREAK_REGEX = /$[^$]/gms;

/**
 * A regular expression that matches a GitHub alert marker at the start of a string, together with the rest of that
 * line and the line break that ends it.
 *
 * Capture group 1 is the marker itself (from the leading `[!` all the way to the trailing `]`).
 *
 * @remarks
 *
 * GitHub renders a blockquote as an alert when its first paragraph begins with one of these markers and the marker is
 * alone on its line. The match is deliberately case-insensitive, because GitHub accepts `[!note]` and `[!Note]` just
 * as it accepts `[!NOTE]`. The alternation is written in lower case only to satisfy the `unicorn/better-regex` lint
 * rule; with the `i` flag the case used in the pattern makes no difference.
 *
 * `[^\S\n]*` allows trailing spaces or tabs after the marker, which GitHub also allows, while stopping short of the
 * line break so that the line break itself is part of the match and can be preserved.
 */
const ALERT_MARKER_REGEX = /^(\[!(?:caution|important|note|tip|warning)])[^\S\n]*\n/i;

/**
 * Returns the text node holding the alert marker of a GitHub alert, or `undefined` if the given node is not an alert.
 *
 * @remarks
 *
 * The rules mirror GitHub's own renderer:
 *
 * - The marker must be the very first thing in the blockquote's first paragraph. A marker that appears after other
 * text, or in a later paragraph, does not make an alert.
 * - The marker must be alone on its line, with the body starting on a following line.
 * - Alerts cannot be nested inside other elements, so the blockquote must be at the top level of the document.
 */
function findAlertMarkerNode(
	blockquote: Parent,
	parent: Parent | undefined,
): { value: string } | undefined {
	// GitHub does not render alerts nested inside other elements, including inside another blockquote.
	if (parent?.type !== "root") {
		return undefined;
	}

	const firstBlock = blockquote.children[0];
	if (firstBlock?.type !== "paragraph") {
		return undefined;
	}

	const firstInline = (firstBlock as Parent).children[0] as { type: string; value?: string };
	if (firstInline?.type !== "text" || firstInline.value === undefined) {
		return undefined;
	}

	// A marker with no line break after it is either the whole blockquote, which GitHub does not treat as an alert
	// because it has no body, or a marker with the body on its own line, which GitHub does not treat as an alert
	// either. Neither case has a line break to preserve.
	return ALERT_MARKER_REGEX.test(firstInline.value)
		? (firstInline as { value: string })
		: undefined;
}

/**
 * A remarkjs/unist plugin that strips soft line breaks. This is a workaround for GitHub's inconsistent markdown
 * rendering in GitHub Releases. According to CommonMark, Markdown paragraphs are denoted by two line breaks, and single
 * line breaks should be ignored. But in GitHub releases, single line breaks are rendered. This plugin removes the soft
 * line breaks so that the markdown is correctly rendered.
 *
 * @remarks
 *
 * GitHub alerts (`> [!NOTE]`) depend on the marker being alone on its line, so collapsing that particular line break
 * would stop the alert from rendering. Alert blockquotes are therefore identified before any line breaks are removed,
 * and the line break that ends the marker's line is kept.
 */
export function stripSoftBreaks(): (tree: Node) => void {
	return (tree: Node): void => {
		// Identify alert markers up front. Once soft breaks have been stripped there is no way to tell a marker that
		// was alone on its line from one the author wrote inline with the body, and only the former is an alert.
		const alertMarkerNodes = new Set<{ value: string }>();
		visit(
			tree,
			"blockquote",
			(node: Parent, _index: number | undefined, parent: Parent | undefined) => {
				const markerNode = findAlertMarkerNode(node, parent);
				if (markerNode !== undefined) {
					alertMarkerNodes.add(markerNode);
				}
			},
		);

		visit(tree, "text", (node: { value: string }) => {
			if (alertMarkerNodes.has(node)) {
				// Keep the marker and the line break that follows it, and strip soft breaks from the rest of the node.
				const marker = ALERT_MARKER_REGEX.exec(node.value);
				if (marker !== null) {
					const body = node.value.slice(marker[0].length).replace(SOFT_BREAK_REGEX, " ");
					node.value = `${marker[1]}\n${body}`;
					return;
				}
			}

			node.value = node.value.replace(SOFT_BREAK_REGEX, " ");
		});
	};
}

/**
 * Given a heading string or regex, removes all the content in sections under that heading. Most useful for removing a
 * table of contents section that will later be regenerated. Note that the section heading remains - only the inner
 * content is removed.
 *
 * @param options - `heading` is a string or regex that a section's heading must match to be removed.
 */
export function removeSectionContent(options: {
	heading: string | RegExp;
}): (tree: Root) => void {
	return function (tree: Root) {
		headingRange(tree, options.heading, (start, _nodes, end, _info) => {
			return [
				start,
				// No child nodes - effectively empties the section.
				end,
			];
		});
	};
}

/**
 * Removes all the headings at a particular level. Most useful to remove the top-level H1 headings from a document.
 *
 * @param options - The `level` property must be set to the level of heading to remove.
 */
export function removeHeadingsAtLevel(options: {
	level: 1 | 2 | 3 | 4 | 5 | 6;
}): (tree: Root) => void {
	return (tree: Root) => {
		visit(
			tree,
			"heading",
			(node: Heading, index: number | undefined, parent: Parent | undefined) => {
				if (node.depth === options.level && index !== undefined) {
					parent?.children.splice(index, 1);
					return [SKIP, index];
				}
			},
		);
	};
}

/**
 * Updates URLs of links whose value match a provided value.
 *
 * @param options - `checkValue` is a string that will be compared against the link text. Only matching nodes will be
 * updated. `newUrl` is the new URL to assign to the link.
 */
export function updateTocLinks(options: {
	checkValue: string;
	newUrl: string;
}): (tree: Root) => void {
	const { checkValue, newUrl } = options;

	return (tree: Root) => {
		visit(tree, "link", (node: Link) => {
			if (node.children?.[0].type === "text" && node.children[0].value === checkValue) {
				node.url = newUrl;
			}
		});
	};
}
