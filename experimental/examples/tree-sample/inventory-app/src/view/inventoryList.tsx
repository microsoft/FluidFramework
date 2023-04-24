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

	const counters = Object.keys(inventory).map((key) => {
		const value = inventory[key] as number;

		return (
			<Counter
				key={key}
				title={key}
				count={value}
				onDecrement={() => (inventory[key] as number)--}
				onIncrement={() => (inventory[key] as number)++}
			></Counter>
		);
	});

	return (
		<div>
			<h1>Inventory:</h1>
			{counters}
		</div>
	);
};
