/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import GithubSlugger from "github-slugger";
import type { Heading, Html } from "mdast";
import type { Node } from "unist";
import { visit } from "unist-util-visit";

/**
 * Using the same instance for all slug generation ensures that no duplicate IDs are generated.
 */
const slugger = new GithubSlugger();

/**
 * A remarkjs/unist plugin that interts HTML anchor nodes before heading text. This is a workaround for GitHub's lack of
 * automatic heading links in GitHub Releases. GitHub's markdown rendering is inconsistent, and in this case it does not
 * add automatic links.
 *
 * For more details, see: https://github.com/orgs/community/discussions/48311#discussioncomment-10436184
 */
export function remarkHeadingLinks(): (tree: Node) => void {
	return (tree: Node): void => {
		visit(tree, "heading", (node: Heading) => {
			if (node.children?.length > 0) {
				const firstChild = node.children[0];
				if (firstChild.type === "text") {
					const headingValue = firstChild.value;
					const slug = slugger.slug(headingValue);
					// We need to insert an Html node instead of a string, because raw
					// strings will get markdown-escaped when rendered
					const htmlNode: Html = {
						type: "html",
						value: `<a id="${slug}"></a>`,
					};
					// Insert the HTML node before the text node of the heading
					node.children.unshift(htmlNode);
				}
			}
		});
	};
}
