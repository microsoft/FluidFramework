/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeStoredSchema } from "../../core";

export interface SchemaChange {
	/**
	 * This property contains the new stored schema for the document and the old schema for inverting.
	 */
	readonly schema: { new: TreeStoredSchema; old: TreeStoredSchema };
}
