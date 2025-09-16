/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { usePropTreeNode, type PropTreeNode } from "@fluid-experimental/tree-react-api";
import * as React from "react";

import type { Inventory } from "../schema.js";

import { Counter } from "./counter.js";

export const MainView: React.FC<{ root: PropTreeNode<Inventory> }> = ({ root }) =>
	// This could use a more granular observation strategy, like having a component for each part, but such an approach is not required
	usePropTreeNode(root, (inventory: Inventory) => {
		const counters: JSX.Element[] = inventory.parts.map((part) => (
			<Counter
				key={part.name}
				title={part.name}
				count={part.quantity}
				onDecrement={(): number => part.quantity--}
				onIncrement={(): number => part.quantity++}
			></Counter>
		));

		return (
			<div>
				<h1>Inventory:</h1>
				{counters}
			</div>
		);
	});
