/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";
import type { Root as HtmlRoot } from "hast";

import type { NormalizedTree } from "./mdast/index.js";

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
 * An {@link ApiDocument} with standard Markdown content.
 *
 * @remarks The contents will be "normalized", meaning that they will not include any library-specific node kinds.
 *
 * @public
 * @sealed
 */
export type MarkdownDocument = ApiDocument<NormalizedTree>;

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
