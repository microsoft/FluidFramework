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
	 * @remarks while not expressable in TypeScript, these changes should never have two `ModularChangeset`s adjacent in the list.
	 */
	readonly changes: readonly (
		| { readonly type: "data"; readonly innerChange: ModularChangeset }
		| { readonly type: "schema"; readonly innerChange: SchemaChange }
	)[];
}
