/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { AllowedUpdateType, ISharedTree, ISharedTreeView } from "@fluid-experimental/tree2";
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

export const SharedTreeView: React.FC<{ tree: ISharedTree }> = ({ tree }) => {
	const typedTree = React.useMemo<ISharedTreeView>(
		() => tree.view.schematize(schemaPolicy),
		[tree.view],
	);
	const [invalidations, setInvalidations] = React.useState(0);
	React.useEffect(() => {
		return typedTree.events.on("afterBatch", () => {
			setInvalidations(invalidations + 1);
		});
	});
	const root = typedTree.context.root;

	const inventory: Inventory = root[0] as unknown as Inventory;
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
