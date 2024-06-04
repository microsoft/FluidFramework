/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useTree } from "@fluid-experimental/tree-react-api";
import * as React from "react";

import { Inventory } from "../schema.js";

import { Counter } from "./counter.js";

export const MainView: React.FC<{ root: Inventory }> = ({ root: inventory }) => {
	useTree(inventory);

	const counters: JSX.Element[] = [];

	for (const part of inventory.parts) {
		counters.push(
			<Counter
				key={part.name}
				title={part.name}
				count={part.quantity}
				onDecrement={(): number => part.quantity--}
				onIncrement={(): number => part.quantity++}
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
