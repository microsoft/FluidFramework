/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeConfiguration } from "@fluidframework/tree";
import { Table } from "./tree";
import { initFluid } from "./azure";

export const treeConfiguration = new TreeConfiguration(Table, () => new Table({ rows: [] }));

async function start() {
	const { tree } = await initFluid();
}

start().catch((error) => console.error(error));
