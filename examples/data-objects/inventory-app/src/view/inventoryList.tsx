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
} from "@fluidframework/react/alpha";
import { Tree } from "fluid-framework";
import * as React from "react";

import type { Inventory } from "../schema.js";
import { Part } from "../schema.js";

import { Counter } from "./counter.js";

/**
 * Top level view for this examples.
 * @remarks
 * This is an easy place to enable StrictMode if desired.
 *
 * This component does not use any of the tree invalidation logic.
 * This is safe because the node is passed in as a PropTreeNode:
 * the type system will not allow this component to access any of the contents of the node that can change
 * and thus no custom invalidation is needed.
 */
export const MainView: React.FC<{ root: PropTreeNode<Inventory> }> = ({ root }) => {
	return (
		// <React.StrictMode>
		<InventoryView root={root} />
		// </React.StrictMode>
	);
};

/**
 * View which consumes part of a tree, delegating some to sub-components.
 *
 * @remarks This demonstrates how arrays can be handled efficiently and easily.
 */
const InventoryView: React.FC<{ root: PropTreeNode<Inventory> }> =
	withMemoizedTreeObservations(({ root }: { root: Inventory }) => {
		const parts = root.parts;

		// Callback to remove a part, passed down to the PartView.
		// This callback is memoized to avoid unnecessary re-renders of the PartView.
		// This approach is better than adding a remove method to the Part
		// schema since it does not cause potential misbehavior if the part schema is reused with other parents.
		const removeChild = React.useCallback(
			(part: Part) => parts.removeAt(Tree.key(part) as number),
			[parts],
		);

		const partViews = parts.map((part) => (
			// Note the use of `objectIdNumber` here to get a stable key from the TreeNode.
			// This pattern can be used when ever a React key is needed for a component which corresponds to a TreeNode.
			<PartView key={objectIdNumber(part)} part={part} remove={removeChild} />
		));

		return (
			<div>
				<h1>Inventory:</h1>
				{partViews}
				<hr />
				<button
					onClick={() => root.parts.insertAtEnd(new Part({ name: "New Part", quantity: 0 }))}
				>
					Add Part
				</button>
			</div>
		);
	});

/**
 * A memoized auto-invalidated {@link Part}
 */
const PartView = withMemoizedTreeObservations(
	({ part, remove }: { part: Part; remove: (part: Part) => void }) => (
		<span>
			<Counter
				key={part.name}
				title={part.name}
				count={part.quantity}
				onDecrement={(): number => part.quantity--}
				onIncrement={(): number => part.quantity++}
			/>
			{/* Add an ability to remove the part.
			This allows hitting a lot more edge cases
			(like component unmount and cases where the React key in the array actually matters). */}
			<button onClick={() => remove(part)}>Remove Part</button>
		</span>
	),
);

//
// Below here are some unused examples of other ways to use the react tree utilities:
//

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
 * Example of a view which consumes part of a tree, delegating some to sub-components.
 *
 * This version uses usePropTreeNode. See InventoryView for a version using withMemoizedTreeObservations.
 */
export const InventoryViewWithHook: React.FC<{ root: PropTreeNode<Inventory> }> = ({
	root,
}) => {
	const data: { nodes: readonly PropTreeNode<Part>[]; removeChild: (part: Part) => void } =
		usePropTreeNode(root, (inventory: Inventory) => {
			const partsList = inventory.parts;
			// Example manually wrapping in PropNodes, showing how types without automatic support can still be made type safe.
			// partsList.map((node) => toPropTreeNode(node)),
			// Note that Array support is built in now, so this can just be:
			const nodes = [...partsList];

			// React's linter does not allow hooks in callbacks, but it is safe to suppress this for usePropTreeNode since it runs the callback immediately.
			// eslint-disable-next-line react-hooks/rules-of-hooks
			const removeChild = React.useCallback(
				(part: Part) => partsList.removeAt(Tree.key(part) as number),
				[partsList],
			);

			return { nodes, removeChild };
		});

	// Since usePropTreeNode is a hook, we can't use it on each item in this array.
	// We can however use a component which uses the hook internally.
	// Passing the node to the components as a PropTreeNode in its Props (as is done here)
	// is the design pattern after which PropTreeNode was named.
	const parts: readonly React.JSX.Element[] = data.nodes.map((part) => (
		<PartView key={objectIdNumber(part)} part={part} remove={data.removeChild} />
	));

	return (
		<div>
			<h1>Inventory:</h1>
			{parts}
		</div>
	);
};
