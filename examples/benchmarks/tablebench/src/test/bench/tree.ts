/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedTree, SchemaFactory } from "@fluidframework/tree";
import { create } from "./utils";
import { generateTable } from "./data";

const _ = new SchemaFactory("com.fluidframework.benchmarks.table");

const Row = _.object("Row", {
	"Order ID": _.number,
	"Region": _.string,
	"Country": _.string,
	"Item Type": _.string,
	"Sales Channel": _.string,
	"Order Priority": _.string,
	"Units Sold": _.number,
	"Unit Price": _.number,
	"Unit Cost": _.number,
	"Total Revenue": _.number,
	"Total Cost": _.number,
	"Total Profit": _.number,
	"Order Date": _.number,
	"Ship Date": _.number,
});

const Table = _.array(Row);

export function createTree(rows = 10000) {
	const tree = create(SharedTree.getFactory()) as SharedTree;

	const view = tree.schematize({
		schema: Table,
		initialTree: () => generateTable(rows),
	});

	return view.root;
}
