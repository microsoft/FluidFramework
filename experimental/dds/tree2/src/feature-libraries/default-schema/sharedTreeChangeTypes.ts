/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaChange, ModularChangeset } from "../modular-schema";

export interface SharedTreeChange {
	readonly modularChange?: ModularChangeset;
	readonly schemaChange?: SchemaChange;
}
