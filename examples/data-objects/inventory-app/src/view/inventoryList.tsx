/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { useTreeContext } from "@fluid-experimental/tree-react-api";
import { Inventory, InventoryField } from "../schema";
import { Counter } from "./counter";

export const MainView: React.FC<{ tree: InventoryField }> = ({ tree }) => {
	// TODO: offer an API to subscribe to invalidation from a field to avoid depending on the whole document here.
	useTreeContext(tree.context);
	const inventory: Inventory = tree.content;

	const counters: JSX.Element[] = [];

	for (const part of inventory.parts) {
		counters.push(
			<Counter key={part.name} title={part.name} count={part.boxedQuantity}></Counter>,
		);
	}

	return (
		<div>
			<h1>Inventory:</h1>
			{counters}
		</div>
	);
};
