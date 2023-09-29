/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedTree } from "@fluid-experimental/tree2";
import { useTree } from "@fluid-experimental/tree-react-api";
import { Inventory, schemaPolicy } from "../schema";
import { Counter } from "./counter";

export const HookView: React.FC<{ tree: ISharedTree }> = ({ tree }) => {
	const root = useTree(tree.view, schemaPolicy);
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
