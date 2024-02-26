/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeStoredSchema } from "../../core/index.js";

/**
 * A change that updates the schema of a Shared Tree.
 */
export interface SchemaChange {
	/**
	 * This property contains the new stored schema for the document and the old schema for inverting.
	 */
	readonly schema: { new: TreeStoredSchema; old: TreeStoredSchema };
}
