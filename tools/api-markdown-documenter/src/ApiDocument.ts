/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import type { Root as HtmlRoot } from "hast";

import type { NormalizedTree, Section } from "./mdast/index.js";

/**
 * A document for an API item.
 *
 * @public
 * @sealed
 */
export interface ApiDocument<TContents = unknown> {
	/**
	 * The API item this document was created for.
	 */
	readonly apiItem: ApiItem;

	/**
	 * Document contents.
	 */
	readonly contents: TContents;

	/**
	 * Path to which the resulting document should be saved.
	 *
	 * @remarks Does not include the file extension.
	 */
	readonly documentPath: string;
}

/**
 * An {@link ApiDocument} with Markdown content.
 *
 * @remarks
 * Note that the Markdown content contains custom `mdast` types introduced by this library.
 * TODO: link to normalization utilities once they are formalized.
 *
 * @public
 * @sealed
 */
export type MarkdownDocument = ApiDocument<readonly Section[]>;

/**
 * An {@link ApiDocument} with standard Markdown content.
 *
 * @public
 * @sealed
 */
export type NormalizedMarkdownDocument = ApiDocument<NormalizedTree>;

/**
 * An {@link ApiDocument} with HTML content.
 *
 * @public
 * @sealed
 */
export type HtmlDocument = ApiDocument<HtmlRoot>;

/**
 * An {@link ApiDocument} with HTML content.
 *
 * @public
 * @sealed
 */
export type RenderedDocument = ApiDocument<string>;
