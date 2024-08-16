/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type AnchorNode, type AnchorSet, type UpPath, anchorSlot } from "../core/index.js";
import {
	ContextSlot,
	type FlexTreeNodeSchema,
	type FlexMapNodeSchema,
	type FlexObjectNodeSchema,
	type FlexTreeMapNode,
	type FlexTreeNode,
	type FlexTreeObjectNode,
	assertFlexTreeEntityNotFreed,
	flexTreeSlot,
	type FieldKinds,
	type FlexFieldSchema,
	type MapTreeNode,
	isMapTreeNode,
} from "../feature-libraries/index.js";
import { fail } from "../util/index.js";
import type { WithType, TreeNode } from "./core/index.js";
import type { TreeArrayNode } from "./arrayNode.js";
// TODO: decide how to deal with dependencies on flex-tree implementation.
// eslint-disable-next-line import/no-internal-modules
import { makeTree } from "../feature-libraries/flex-tree/lazyNode.js";
import type { TreeMapNode } from "./mapNode.js";
import { getKernel } from "./core/index.js";

// This file contains various maps and helpers for supporting associating simple TreeNodes with their InnerNodes, and swapping those InnerNodes as part of hydration.
// See ./ProxyBinding.md for a high-level overview of the process.

/**
 * An anchor slot which associates an anchor with its corresponding TreeNode, if there is one.
 * @remarks
 * For this to work, we have to require that there is at most a single view using a given AnchorSet.
 * FlexTree already has this assumption, and we also assume there is a single simple-tree per FlexTree, so this is valid.
 */
const proxySlot = anchorSlot<TreeNode>();

// The following records are maintained as WeakMaps, rather than a private symbol (e.g. like `targetSymbol`) on the TreeNode.
// The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
// Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
// via the trap, or the trap not properly handling the special symbol, etc.

/**
 * A reverse mapping of {@link proxySlot} that is updated at the same time.
 *
 * @remarks
 * Nodes in this map are hydrated (and thus "marinated" or "cooked").
 * Nodes not in this map are known to be {@link Unhydrated}.
 * Thus this map can be used to check if a node is hydrated.
 *
 * Any node not in this map must be in {@link proxyToMapTreeNode} since it contains all unhydrated nodes.
 * It also contains "marinated" nodes which are in both.
 */
const proxyToAnchorNode = new WeakMap<TreeNode, AnchorNode>();

/**
 * Map {@link Unhydrated} nodes and "marinated" nodes to and from their underlying MapTreeNode.
 * These maps are populated by the TreeNode's constructor when called by a user before the node is inserted into the tree and queried.
 */
const proxyToMapTreeNode = new WeakMap<TreeNode, MapTreeNode>();

/**
 * {@inheritdoc proxyToMapTreeNode}
 */
const mapTreeNodeToProxy = new WeakMap<MapTreeNode, TreeNode>();

/**
 * Used by {@link anchorProxy} as an optimization to ensure that only one anchor is remembered at a time for a given anchor node
 */
const anchorForgetters = new WeakMap<TreeNode, () => void>();

/**
 * Creates an anchor node and associates it with the given proxy.
 * @privateRemarks
 * Use `forgetters` to cleanup the anchor allocated by this function once the anchor is no longer needed.
 * In practice, this happens when either the anchor node is destroyed, or another anchor to the same node is created by a new flex node.
 *
 * The FlexTreeNode holds a reference to the same anchor, and has a lifetime at least as long as the simple-tree,
 * so this would be unnecessary except for the case of "marinated" nodes, which have an anchor,
 * but might not have a FlexTreeNode.
 * Handling this case is an optimization assuming that this extra anchor reference is cheaper than eagerly creating FlexTreeNodes.
 */
export function anchorProxy(anchors: AnchorSet, path: UpPath, proxy: TreeNode): AnchorNode {
	assert(!anchorForgetters.has(proxy), 0x91c /* Proxy anchor should not be set twice */);
	const anchor = anchors.track(path);
	const anchorNode = anchors.locate(anchor) ?? fail("Expected anchor node to be present");
	bindHydratedNodeToAnchor(proxy, anchorNode);
	const forget = (): void => {
		if (anchors.locate(anchor)) {
			anchors.forget(anchor);
		}
		anchorForgetters.delete(proxy);
		off();
	};
	anchorForgetters.set(proxy, forget);
	const off = anchorNode.on("afterDestroy", forget);
	return anchorNode;
}

/**
 * Retrieves the flex node associated with the given target via {@link setInnerNode}.
 * @remarks
 * For {@link Unhydrated} nodes, this returns the MapTreeNode.
 *
 * For hydrated nodes it returns a FlexTreeNode backed by the forest.
 * Note that for "marinated" nodes, this FlexTreeNode exists and returns it: it does not return the MapTreeNode which is the current InnerNode.
 */
export function getOrCreateInnerNode(
	treeNode: TypedNode<FlexObjectNodeSchema>,
	allowFreed?: true,
): InnerNode & FlexTreeObjectNode;
export function getOrCreateInnerNode(treeNode: TreeArrayNode, allowFreed?: true): InnerNode;
export function getOrCreateInnerNode(
	treeNode: TreeMapNode,
	allowFreed?: true,
): InnerNode &
	FlexTreeMapNode<FlexMapNodeSchema<string, FlexFieldSchema<typeof FieldKinds.optional>>>;
export function getOrCreateInnerNode(treeNode: TreeNode, allowFreed?: true): InnerNode;
export function getOrCreateInnerNode(treeNode: TreeNode, allowFreed = false): InnerNode {
	const anchorNode = proxyToAnchorNode.get(treeNode);
	if (anchorNode !== undefined) {
		// The proxy is bound to an anchor node, but it may or may not have an actual flex node yet
		const flexNode = anchorNode.slots.get(flexTreeSlot);
		if (flexNode !== undefined) {
			return flexNode; // If it does have a flex node, return it...
		} // ...otherwise, the flex node must be created
		const context = anchorNode.anchorSet.slots.get(ContextSlot) ?? fail("missing context");
		const cursor = context.checkout.forest.allocateCursor("getFlexNode");
		context.checkout.forest.moveCursorToPath(anchorNode, cursor);
		const newFlexNode = makeTree(context, cursor);
		cursor.free();
		// Calling this is a performance improvement, however, do this only after demand to avoid momentarily having no anchors to anchorNode
		anchorForgetters?.get(treeNode)?.();
		if (!allowFreed) {
			assertFlexTreeEntityNotFreed(newFlexNode);
		}
		return newFlexNode;
	}

	// Unhydrated case
	return proxyToMapTreeNode.get(treeNode) ?? fail("Expected raw tree node for proxy");
}

/**
 * For "cooked" nodes this is a FlexTreeNode thats a projection of forest content.
 * For {@link Unhydrated} nodes this is a MapTreeNode.
 * For "marinated" nodes, some code (ex: getOrCreateInnerNode) returns the FlexTreeNode thats a projection of forest content, and some code (ex: tryGetInnerNode) returns undefined.
 *
 * @remarks
 * Currently MapTreeNode extends FlexTreeNode, and most code which can work with either just uses FlexTreeNode.
 * TODO: Code should be migrating toward using this type to distinguish to two use-cases.
 *
 * TODO: The inconsistent handling of "marinated" cases should be cleaned up.
 * Maybe getOrCreateInnerNode should cook marinated nodes so they have a proper InnerNode?
 */
export type InnerNode = FlexTreeNode | MapTreeNode;

/**
 * Retrieves the InnerNode associated with the given target via {@link setInnerNode}, if any.
 * @remarks
 * If `target` is a unhydrated node, returns its MapTreeNode.
 * If `target` is a cooked node (or marinated but a FlexTreeNode exists) returns the FlexTreeNode.
 * If the target is not a node, or a marinated node with no FlexTreeNode for its anchor, returns undefined.
 */
export function tryGetInnerNode(target: unknown): InnerNode | undefined {
	// Calling 'WeakMap.get()' with primitives (numbers, strings, etc.) will return undefined.
	// This is in contrast to 'WeakMap.set()', which will throw a TypeError if given a non-object key.
	const anchorNode = proxyToAnchorNode.get(target as TreeNode);
	// Hydrated node case
	if (anchorNode !== undefined) {
		const flex = anchorNode.slots.get(flexTreeSlot);
		if (flex !== undefined) {
			// Cooked, or possible Marinated but something else cased the flex tree node to exist.
			return flex;
		}
		// Marinated case
		assert(
			proxyToMapTreeNode.get(target as TreeNode) === undefined,
			"marinated nodes should not have MapTreeNodes",
		);
		return undefined;
	}
	// Unhydrated node or not a node case:
	return proxyToMapTreeNode.get(target as TreeNode);
}

/**
 * Retrieves the proxy associated with the given flex node via {@link setInnerNode}, if any.
 */
export function tryGetCachedTreeNode(flexNode: InnerNode): TreeNode | undefined {
	if (isMapTreeNode(flexNode)) {
		// Unhydrated case
		return mapTreeNodeToProxy.get(flexNode);
	}
	// Hydrated case
	return flexNode.anchorNode.slots.get(proxySlot);
}

/**
 * Associate the given TreeNode and the given flex node.
 * @returns The node.
 * @remarks
 * This creates a 1:1 mapping between the tree node and InnerNode.
 * Either can be retrieved from the other via {@link getOrCreateInnerNode}/{@link tryGetInnerNode} or {@link tryGetCachedTreeNode}.
 * If the given proxy is already mapped to an flex node, the existing mapping will be overwritten.
 * If the given flex node is already mapped to a different proxy, this function will fail.
 */
export function setInnerNode<TNode extends TreeNode>(
	node: TNode,
	innerNode: InnerNode,
): TNode {
	const existingFlexNode = proxyToAnchorNode.get(node)?.slots.get(flexTreeSlot);
	assert(
		existingFlexNode === undefined,
		0x91d /* Cannot associate a flex node with multiple targets */,
	);
	if (isMapTreeNode(innerNode)) {
		// Unhydrated case
		proxyToMapTreeNode.set(node, innerNode);
		mapTreeNodeToProxy.set(innerNode, node);
	} else {
		// Hydrated case
		assert(
			tryGetCachedTreeNode(innerNode) === undefined,
			0x7f5 /* Cannot associate an flex node with multiple targets */,
		);
		bindHydratedNodeToAnchor(node, innerNode.anchorNode);
	}
	return node;
}

/**
 * Bi-directionally associates the given hydrated TreeNode to the given anchor node.
 * @remarks Cleans up mappings to {@link MapTreeNode} - it is assumed that they are no longer needed once the proxy has an anchor node.
 */
function bindHydratedNodeToAnchor(node: TreeNode, anchorNode: AnchorNode): void {
	// If the proxy currently has a raw node, forget it
	const mapTreeNode = proxyToMapTreeNode.get(node);
	if (mapTreeNode !== undefined) {
		proxyToMapTreeNode.delete(node);
		mapTreeNodeToProxy.delete(mapTreeNode);
	}
	// Once a proxy has been associated with an anchor node, it should never change to another anchor node
	assert(
		!proxyToAnchorNode.has(node),
		0x91e /* Proxy has already been bound to a different anchor node */,
	);
	proxyToAnchorNode.set(node, anchorNode);
	// However, it's fine for an anchor node to rotate through different proxies when the content at that place in the tree is replaced.
	anchorNode.slots.set(proxySlot, node);
	getKernel(node).hydrate(anchorNode);
}

/**
 * Given a node's schema, return the corresponding object in the proxy-based API.
 */
type TypedNode<TSchema extends FlexTreeNodeSchema> = TreeNode & WithType<TSchema["name"]>;

export function tryDisposeTreeNode(anchorNode: AnchorNode): void {
	const treeNode = anchorNode.slots.get(proxySlot);
	if (treeNode !== undefined) {
		const kernel = getKernel(treeNode);
		kernel.dispose();
	}
}
