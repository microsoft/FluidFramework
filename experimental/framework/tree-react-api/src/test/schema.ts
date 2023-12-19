/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";

const builder = new SchemaFactory("tree-react-api");

export class Inventory extends builder.object("Contoso:InventoryItem-1.0.0", {
	nuts: builder.number,
	bolts: builder.number,
}) {}
