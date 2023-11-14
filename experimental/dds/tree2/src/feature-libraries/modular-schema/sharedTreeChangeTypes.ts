/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModularChangeset } from "./modularChangeTypes";
import { SchemaChange } from "./schemaChangeTypes";

export interface SharedTreeChange {
	readonly modularChange?: ModularChangeset;
	readonly schemaChange?: SchemaChange;
}
