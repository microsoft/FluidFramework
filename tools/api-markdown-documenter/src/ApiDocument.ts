/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ApiItem } from "@microsoft/api-extractor-model";

/**
 * A document for an API item.
 *
 * @public
 * @sealed
 */
export interface ApiDocument<TContents> {
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
