/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import GithubSlugger from "github-slugger";
import type { Heading, Html } from "mdast";
import { toString } from "mdast-util-to-string";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

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
export function remarkHeadingLinks(): (tree: Node) => void {
	return (tree: Node): void => {
		visit(tree, "heading", (node: Heading) => {
			if (node.children?.length > 0) {
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
 * Capture group 1 is the admonition type/title (from the leading `[!` all the way to the trailing `]`). Capture group 2 is any trailing whitespace.
 *
 * @remarks
 *
 * Description of the regular expression:
 *
 * This regular expression matches patterns in the form of `[!WORD]` where WORD can be CAUTION, IMPORTANT, NOTE, TIP, or
 * WARNING. It ensures that the pattern is not followed by only whitespace characters until the end of the line.
 * Additionally, it captures any whitespace characters that follow the matched pattern.
 */
const ADMONITION_REGEX = /(\[!(?:CAUTION|IMPORTANT|NOTE|TIP|WARNING)])(?!\s*$)(\s*)/gm;

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
