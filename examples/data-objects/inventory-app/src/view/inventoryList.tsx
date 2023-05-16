/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { AllowedUpdateType, ISharedTree } from "@fluid-experimental/tree2";
import { useTree } from "@fluid-experimental/tree-react-api";
import { Inventory, schema } from "../schema";
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
	const inventory: Inventory = useTree(tree, schemaPolicy);

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
