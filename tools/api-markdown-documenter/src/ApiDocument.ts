/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";

import type { NormalizedTree } from "./mdast/index.js";

/**
 * A document for an API item, whose contents are represented in Markdown.
 *
 * @public
 * @sealed
 */
export interface ApiDocument {
	/**
	 * The API item this document was created for.
	 */
	readonly apiItem: ApiItem;

	/**
	 * Document contents.
	 */
	readonly contents: NormalizedTree;

	/**
	 * Path to which the resulting document should be saved.
	 *
	 * @remarks Does not include the file extension.
	 */
	readonly documentPath: string;
}

/**
 * A document for an API item, whose contents are represented by a raw string that can be written to a file.
 *
 * @public
 * @sealed
 */
export interface RenderedDocument {
	/**
	 * The API item this document was created for.
	 */
	readonly apiItem: ApiItem;

	/**
	 * Document contents.
	 */
	readonly contents: string;

	/**
	 * Path to which the resulting document should be saved.
	 *
	 * @remarks Includes the file extension
	 */
	readonly filePath: string;
}
