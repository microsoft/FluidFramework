/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { Tree } from "@fluidframework/tree";
import { Inventory } from "../schema.js";
import { Counter } from "./counter.js";

export const MainView: React.FC<{ root: Inventory }> = ({ root: inventory }) => {
	// Use a React effect hook to invalidate this component when the inventory changes.
	// We do this by incrementing a counter, which is passed as a dependency to the effect hook.
	const [invalidations, setInvalidations] = React.useState(0);

	// React effect hook that increments the 'invalidation' counter whenever inventory or any of its children change.
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return Tree.on(inventory, "afterChange", () => {
			setInvalidations((i) => i + 1);
		});
	}, [invalidations, inventory]);

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
