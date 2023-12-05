/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeStoredSchema } from "../../core";

export interface SchemaChange {
	/**
	 * If this property is an object, then it contains the new stored schema for the document and the old schema for inverting.
	 * If this property is undefined, then processing it should do nothing (e.g. because it is the result of a conflict).
	 */
	readonly schema?: { new: TreeStoredSchema; old: TreeStoredSchema };
}
