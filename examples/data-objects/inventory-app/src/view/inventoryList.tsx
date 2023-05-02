/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedTree } from "@fluid-experimental/tree2";
import { useTree } from "@fluid-experimental/tree-react-api";
import { Inventory } from "../schema";
import { Counter } from "./counter";

export const MainView: React.FC<{ tree: ISharedTree }> = ({ tree }) => {
	const inventory = useTree<Inventory>(tree);

	const counters: JSX.Element[] = [];

	for (const part of inventory.parts) {
		counters.push(
			<Counter
				key={part.name}
				title={part.name}
				count={part.quantity}
				onDecrement={() => part.quantity--}
				onIncrement={() => part.quantity++}
			></Counter>);
	}
	
	return (
		<div>
			<h1>Inventory:</h1>
			{counters}
		</div>
	);
};
