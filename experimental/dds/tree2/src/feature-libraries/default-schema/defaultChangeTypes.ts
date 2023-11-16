/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModularChangeset } from "../modular-schema";
import { SchemaChange } from "../schema-editing";

export interface SharedTreeChange {
	readonly modularChange?: ModularChangeset;
	readonly schemaChange?: SchemaChange;
}
