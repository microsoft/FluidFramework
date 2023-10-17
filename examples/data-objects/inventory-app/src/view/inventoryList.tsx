/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { node } from "@fluid-experimental/tree2";
import { Inventory } from "../schema";
import { Counter } from "./counter";

export const MainView: React.FC<{ inventory: Inventory }> = ({ inventory }) => {
	// This proof-of-concept implementation allocates a state variable this is modified
	// when the tree changes to trigger re-render.
	const [invalidations, setInvalidations] = React.useState(0);

	// Register for tree deltas when the component mounts
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		const u = node(inventory).on("subtreeChanging", () => {
			// TODO: Remove RAF when we have an "afterChange" event.
			requestAnimationFrame(() => setInvalidations((i) => i + 1));
		});

		return u;
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
