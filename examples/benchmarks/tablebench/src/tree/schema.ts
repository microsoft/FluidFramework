/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "@fluidframework/tree";

const _ = new SchemaFactory("com.fluidframework.benchmarks.table");

export class Row extends _.object("Row", {
	id: _.number,
	class: _.string,
	part: [_.string, _.number],
	description: _.string,
	for: [_.string, _.number],
	substitute: [_.number, _.string],
	substituteDescription: [_.string],
	price: _.number,
	quantity: _.number,
}) {}

export class Table extends _.object("Table", {
	rows: _.array(Row),
}) {}
