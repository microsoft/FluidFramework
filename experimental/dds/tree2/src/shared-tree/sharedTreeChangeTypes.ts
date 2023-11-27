/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModularChangeset, SchemaChange } from "../feature-libraries/";

/**
 * The change format for the SharedTree.
 * Supports both data and schema changes which can be interleaved as a result of composition.
 */
export interface SharedTreeChange {
	/**
	 * The changes to apply.
	 * @remarks while not expressable in TypeScript, these changes must follow a strictly alternating pattern (i.e. there will never be two elements
	 * of the same type in a row)
	 */
	readonly changes: readonly (
		| { type: "data"; change: ModularChangeset }
		| { type: "schema"; change: SchemaChange }
	)[];
}
