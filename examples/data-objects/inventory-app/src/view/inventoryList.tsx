/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	objectIdNumber,
	usePropTreeNode,
	withTreeObservations,
	withMemoizedTreeObservations,
	type PropTreeNode,
} from "@fluid-experimental/tree-react-api";
import * as React from "react";

import type { Inventory, Part } from "../schema.js";

import { Counter } from "./counter.js";

/**
 * Example of a view which directly consumes multiple nodes from the tree.
 */
export const InventoryViewMonolithic =
	// This could use a more granular observation strategy, like having a component for each part, but such an approach is not required
	withTreeObservations(({ root }: { root: Inventory }) => {
		const counters: JSX.Element[] = root.parts.map((part) => (
			<Counter
				key={part.name}
				title={part.name}
				count={part.quantity}
				onDecrement={(): number => part.quantity--}
				onIncrement={(): number => part.quantity++}
			/>
		));

		return (
			<div>
				<h1>Inventory:</h1>
				{counters}
			</div>
		);
	});

/**
 * Top level view is an easy place to enable StrictMode if desired.
 */
export const MainView: React.FC<{ root: PropTreeNode<Inventory> }> = ({ root }) => {
	return (
		// <React.StrictMode>
		<InventoryView root={root} />
		// </React.StrictMode>
	);
};

/**
 * Example of a view which consumes part of a tree, delegating some to sub-components.
 *
 * This version uses usePropTreeNode. See InventoryView2 for a version using withMemoizedTreeObservations.
 */
export const InventoryViewWithHook: React.FC<{ root: PropTreeNode<Inventory> }> = ({
	root,
}) => {
	const partNodes = usePropTreeNode(root, (inventory: Inventory) =>
		// Example manually wrapping in PropNodes, showing how types without automatic support can still be made type safe.
		// inventory.parts.map((node) => toPropTreeNode(node)),
		// Note that Array support is built in now, so this can just be:
		[...inventory.parts],
	);

	// Since usePropTreeNode is a hook, we can't use it on each item in this array.
	// We can however use a component which uses the hook internally.
	// Passing the node to the components as a PropTreeNode in its Props (as is done here)
	// is the design pattern after which PropTreeNode was named.
	const parts: readonly React.JSX.Element[] = partNodes.map((part) => (
		<PartView key={objectIdNumber(part)} part={part} />
	));

	return (
		<div>
			<h1>Inventory:</h1>
			{parts}
		</div>
	);
};

/**
 * View which consumes part of a tree, delegating some to sub-components.
 */
const InventoryView: React.FC<{ root: PropTreeNode<Inventory> }> =
	withMemoizedTreeObservations(({ root }: { root: Inventory }) => {
		const parts = root.parts.map((part) => (
			<PartView key={objectIdNumber(part)} part={part} />
		));

		return (
			<div>
				<h1>Inventory:</h1>
				{parts}
			</div>
		);
	});

const PartView = withMemoizedTreeObservations(({ part }: { part: Part }) => (
	<Counter
		key={part.name}
		title={part.name}
		count={part.quantity}
		onDecrement={(): number => part.quantity--}
		onIncrement={(): number => part.quantity++}
	/>
));
