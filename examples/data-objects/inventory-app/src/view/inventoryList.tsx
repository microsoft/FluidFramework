/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { AllowedUpdateType, ISharedTree } from "@fluid-experimental/tree2";
import { useTree } from "@fluid-experimental/tree-react-api";
import { Inventory, RootField, schema } from "../schema";
import { Counter } from "./counter";

const schemaPolicy = {
	schema,
	initialTree: {
		parts: [
			{
				name: "nut",
				quantity: 0,
			},
			{
				name: "bolt",
				quantity: 0,
			},
		],
	},
	allowedSchemaModifications: AllowedUpdateType.None,
};

export const MainView: React.FC<{ tree: ISharedTree }> = ({ tree }) => {
	const root: RootField = useTree(tree.view, schemaPolicy);
	// TODO: value fields like `root` which always contain exactly one value should have a nicer API for accessing that child, like `.child`.
	const inventory: Inventory = root[0];

	const counters: JSX.Element[] = [];

	for (const part of inventory.parts) {
		counters.push(
			<Counter
				key={part.name}
				title={part.name}
				count={part.quantity}
				onDecrement={() => part.quantity--}
				onIncrement={() => part.quantity++}
			></Counter>,
		);
	}

	return (
		<div>
			<h1>Inventory:</h1>
			{counters}
		</div>
	);
};
