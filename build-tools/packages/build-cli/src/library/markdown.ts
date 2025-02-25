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
 * A regular expression that extracts an admonition title from a string UNLESS the admonition title is the only thing on
 * the line.
 *
 * Capture group 1 is the admonition type/title (from the leading `[!` all the way to the trailing `]`).
 *
 * @remarks
 *
 * Description of the regular expression:
 *
 * This regular expression matches patterns in the form of `[!WORD]` where WORD can be CAUTION, IMPORTANT, NOTE, TIP, or
 * WARNING. It ensures that the pattern is not followed by only whitespace characters until the end of the line.
 * Additionally, it captures any whitespace characters that follow the matched pattern.
 */
const ADMONITION_REGEX = /(\[!(?:CAUTION|IMPORTANT|NOTE|TIP|WARNING)])(?!\s*$)\s*/gm;

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
 * A remarkjs/unist plugin that strips soft line breaks. This is a workaround for GitHub's inconsistent markdown
 * rendering in GitHub Releases. According to CommonMark, Markdown paragraphs are denoted by two line breaks, and single
 * line breaks should be ignored. But in GitHub releases, single line breaks are rendered. This plugin removes the soft
 * line breaks so that the markdown is correctly rendered.
 */
export function stripSoftBreaks(): (tree: Node) => void {
	return (tree: Node): void => {
		// strip soft breaks
		visit(tree, "text", (node: { value: string }) => {
			node.value = node.value.replace(SOFT_BREAK_REGEX, " ");
		});

		// preserve GitHub admonitions; without this the line breaks in the alert are lost and it doesn't render correctly.
		visit(tree, "blockquote", (node: Node) => {
			visit(node, "text", (innerNode: { value: string }) => {
				// If the text is an admonition title, split
				innerNode.value = innerNode.value.replace(ADMONITION_REGEX, "$1\n");
			});
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
export function removeSectionContent(options: { heading: string | RegExp }): (
	tree: Root,
) => void {
	return function (tree: Root) {
		headingRange(tree, options.heading, (start, nodes, end, info) => {
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
export function removeHeadingsAtLevel(options: { level: 1 | 2 | 3 | 4 | 5 | 6 }): (
	tree: Root,
) => void {
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
export function updateTocLinks(options: { checkValue: string; newUrl: string }): (
	tree: Root,
) => void {
	const { checkValue, newUrl } = options;

	return (tree: Root) => {
		visit(tree, "link", (node: Link) => {
			if (node.children?.[0].type === "text" && node.children[0].value === checkValue) {
				node.url = newUrl;
			}
		});
	};
}
