/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";

const _ = new SchemaFactory("com.fluidframework.benchmarks.table");

export const Row = _.object("Row", {
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

export const Table = _.array(Row);
