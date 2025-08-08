/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Root as HastRoot, Nodes as HastTree } from "hast";
import { h } from "hastscript";
import { toHast } from "mdast-util-to-hast";

import type { HtmlDocument, MarkdownDocument } from "../ApiDocument.js";

import type { TransformationConfiguration } from "./Configuration.js";

/**
 * Generates an HTML AST from the provided {@link MarkdownDocument}.
 *
 * @param document - The document to transform.
 * @param config - HTML transformation configuration.
 *
 * @public
 */
export function documentToHtml(
	document: MarkdownDocument,
	config: TransformationConfiguration,
): HtmlDocument {
	const transformedContents = toHast(document.contents, {
		// Needed as a temporary workaround for lack of support for `hast` trees directly in `mdast`.
		// Only raw HTML strings are supported by default in `mdast`.
		// In a future PR, we will introduce an extension that allows `hast` trees to be used directly instead of this.
		// All HTML content is generated directly by this library. No user HTML content is passed through, so this is safe, just not a best practice.
		allowDangerousHtml: true,
	});

	return {
		apiItem: document.apiItem,
		contents: treeFromBody(transformedContents, config),
		documentPath: document.documentPath,
	};
}

/**
 * Creates a complete HTML AST from the provided body contents.
 *
 * @privateRemarks Exported for testing purposes. Not intended for external use.
 */
export function treeFromBody(body: HastTree, config: TransformationConfiguration): HastRoot {
	const rootBodyContents: HastTree[] = [];
	rootBodyContents.push({
		type: "doctype",
	});
	rootBodyContents.push(
		h(
			"html",
			{
				lang: config.language ?? "en",
			},
			// eslint-disable-next-line unicorn/text-encoding-identifier-case
			[h("head", [h("meta", { charset: "utf-8" })]), h("body", body)],
		),
	);

	return h(undefined, rootBodyContents);
}
