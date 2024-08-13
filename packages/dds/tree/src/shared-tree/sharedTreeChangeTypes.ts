/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ModularChangeset, SchemaChange } from "../feature-libraries/index.js";

export type SharedTreeInnerChange =
	| { readonly type: "data"; readonly innerChange: ModularChangeset }
	| { readonly type: "schema"; readonly innerChange: SchemaChange };

/**
 * The change format for the SharedTree.
 * Supports both data and schema changes which can be interleaved as a result of composition.
 */
export interface SharedTreeChange {
	/**
	 * The changes to apply.
	 * @remarks while not expressable in TypeScript, these changes should never have two `ModularChangeset`s adjacent in the list.
	 * This restriction exists because this change type should preserve the composition behavior of `ModularChangeFamily`, which
	 * always composes runs of `ModularChangeset`s into a single `ModularChangeset`.
	 */
	readonly changes: readonly SharedTreeInnerChange[];
}
