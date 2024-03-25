/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { AnchorNode, AnchorSet, UpPath, anchorSlot } from "../core/index.js";
import {
	FlexFieldNodeSchema,
	FlexMapNodeSchema,
	FlexObjectNodeSchema,
	FlexTreeFieldNode,
	FlexTreeMapNode,
	FlexTreeNode,
	FlexTreeObjectNode,
	assertFlexTreeEntityNotFreed,
	flexTreeSlot,
	schemaIsFieldNode,
	schemaIsMap,
	schemaIsObjectNode,
} from "../feature-libraries/index.js";
import { fail } from "../util/index.js";
import { RawTreeNode } from "./rawNode.js";
import { TreeMapNode, TreeObjectNode } from "./schemaTypes.js";
import { TreeArrayNode } from "./treeArrayNode.js";
import { TreeNode, TypedNode } from "./types.js";

// This file contains various maps and helpers for supporting proxy binding (a.k.a. proxy hydration).
// See ./ProxyBinding.md for a high-level overview of the process.

/**
 * An anchor slot which associates an anchor with its corresponding node proxy, if there is one.
 */
const proxySlot = anchorSlot<TreeNode>();

// The following records are maintained as WeakMaps, rather than a private symbol (e.g. like `targetSymbol`) on the node proxy itself.
// The map behaves essentially the same, except that performing a lookup in the map will not perform a property read/get on the key object (as is the case with a symbol).
// Since `SharedTreeNodes` are proxies with non-trivial `get` traps, this choice is meant to prevent the confusion of the lookup passing through multiple objects
// via the trap, or the trap not properly handling the special symbol, etc.

/** A reverse mapping of {@link proxySlot} that is updated at the same time. */
const proxyToAnchorNode = new WeakMap<TreeNode, AnchorNode>();
/**
 * Maps proxies to their "raw" tree nodes.
 * The raw node exists when the proxy is first created but before it has been associated with a real {@link FlexTreeNode}.
 * For example, after a user calls `const proxy = new Foo({})` but before `proxy` is inserted into the tree and queried.
 */
const proxyToRawFlexNode = new WeakMap<TreeNode, RawTreeNode<FlexFieldNodeSchema, unknown>>();
/** Used by `anchorProxy` as an optimization to ensure that only one anchor is remembered at a time for a given anchor node */
const anchorForgetters = new WeakMap<TreeNode, () => void>();

/**
 * Creates an anchor node and associates it with the given proxy.
 * @privateRemarks Use `forgetters` to cleanup the anchor allocated by this function once the anchor is no longer needed.
 * In practice, this happens when either the anchor node is destroyed, or another anchor to the same node is created by a new flex node.
 */
export function anchorProxy(anchors: AnchorSet, path: UpPath, proxy: TreeNode): void {
	assert(!anchorForgetters.has(proxy), "Proxy anchor should not be set twice");
	const anchor = anchors.track(path);
	const anchorNode = anchors.locate(anchor) ?? fail("Expected anchor node to be present");
	bindProxyToAnchorNode(proxy, anchorNode);
	const forget = () => {
		if (anchors.locate(anchor)) {
			anchors.forget(anchor);
		}
		anchorForgetters.delete(proxy);
		off();
	};
	anchorForgetters.set(proxy, forget);
	const off = anchorNode.on("afterDestroy", forget);
}

/**
 * Retrieves the flex node associated with the given target via {@link setFlexNode}.
 * @remarks Fails if the flex node has not been set.
 */
export function getFlexNode(
	proxy: TypedNode<FlexObjectNodeSchema>,
	allowFreed?: true,
): FlexTreeObjectNode;
export function getFlexNode(
	proxy: TreeArrayNode,
	allowFreed?: true,
): FlexTreeFieldNode<FlexFieldNodeSchema>;
export function getFlexNode(
	proxy: TreeMapNode,
	allowFreed?: true,
): FlexTreeMapNode<FlexMapNodeSchema>;
export function getFlexNode(proxy: TreeNode, allowFreed?: true): FlexTreeNode;
export function getFlexNode(proxy: TreeNode, allowFreed = false): FlexTreeNode {
	const anchorNode = proxyToAnchorNode.get(proxy);
	if (anchorNode !== undefined) {
		// The proxy is bound to an anchor node, but it may or may not have an actual flex node yet
		const flexNode = anchorNode.slots.get(flexTreeSlot);
		if (flexNode !== undefined) {
			return flexNode; // If it does have a flex node, return it...
		} // ...otherwise, the flex node must be created by walking downwards from an existing ancestor
		const newFlexNode = demandSpine(anchorNode);
		// Calling this is a performance improvement, however, do this only after demand to avoid momentarily having no anchors to anchorNode
		anchorForgetters?.get(proxy)?.();
		if (!allowFreed) {
			assertFlexTreeEntityNotFreed(newFlexNode);
		}
		return newFlexNode;
	}

	return proxyToRawFlexNode.get(proxy) ?? fail("Expected raw tree node for proxy");
}

/**
 * Walks up from the given anchor node until an anchor node that has an associated flex node is found.
 * Then, walks back down from that flex node so as to cause the original anchor node to generate a flex node.
 * Fails if there is no ancestor of `anchorNode` bound to a flex node.
 */
function demandSpine(node: AnchorNode): FlexTreeNode {
	const spine = getAnchorNodeSpine(node);
	for (let i = spine.length - 1; i >= 1; i--) {
		const parent = spine[i];
		const child = spine[i - 1];
		const parentFlexNode =
			parent.slots.get(flexTreeSlot) ?? fail("Expected flex tree for anchor node");

		const proxy = parent.slots.get(proxySlot) ?? fail("Expected proxy for anchor node");
		if (schemaIsFieldNode(parentFlexNode.schema)) {
			const array = proxy as TreeArrayNode;
			const _ = array[child.parentIndex];
		} else if (schemaIsMap(parentFlexNode.schema)) {
			const map = proxy as TreeMapNode;
			map.get(child.parentField);
		} else if (schemaIsObjectNode(parentFlexNode.schema)) {
			const obj = proxy as TreeObjectNode<any>;
			const _ = obj[child.parentField];
		} else {
			fail("Unexpected flex node schema type");
		}
	}
	return spine[0].slots.get(flexTreeSlot) ?? fail("Failed to demand flex node");
}

/**
 * Returns the ancestry of the given anchor node up to the first node which is bound to a flex node.
 * For example, given `node`, it might return:
 * ```
 * [node, nodeParent, nodeGrandparent, nodeGreatGrandparent]
 *   ^-------^-- no flex nodes --^       ^-- has a flex node
 * ```
 */
function getAnchorNodeSpine(node: AnchorNode): readonly AnchorNode[] {
	const spine: AnchorNode[] = [node];
	while (spine[spine.length - 1].slots.get(flexTreeSlot) === undefined) {
		const parent =
			spine[spine.length - 1].parent ??
			fail("Failed to hydrate proxy: tree root is unhydrated");

		spine.push(parent);
	}
	return spine;
}

/**
 * Retrieves the flex node associated with the given target via {@link setFlexNode}, if any.
 */
export function tryGetFlexNode(target: unknown): FlexTreeNode | undefined {
	// Calling 'WeakMap.get()' with primitives (numbers, strings, etc.) will return undefined.
	// This is in contrast to 'WeakMap.set()', which will throw a TypeError if given a non-object key.
	return (
		proxyToAnchorNode.get(target as TreeNode)?.slots.get(flexTreeSlot) ??
		proxyToRawFlexNode.get(target as TreeNode)
	);
}

/**
 * Retrieves the proxy associated with the given flex node via {@link setFlexNode}, if any.
 */
export function tryGetProxy(flexNode: FlexTreeNode): TreeNode | undefined {
	return flexNode.anchorNode.slots.get(proxySlot);
}

/**
 * Associate the given proxy and the given flex node.
 * @returns The proxy
 * @remarks
 * This creates a 1:1 mapping between the proxy and tree node.
 * Either can be retrieved from the other via {@link getFlexNode}/{@link tryGetFlexNode} or {@link tryGetProxy}.
 * If the given proxy is already mapped to an flex node, the existing mapping will be overwritten.
 * If the given flex node is already mapped to a different proxy, this function will fail.
 */
export function setFlexNode<TProxy extends TreeNode>(
	proxy: TProxy,
	flexNode: FlexTreeNode,
): TProxy {
	const existingFlexNode = proxyToAnchorNode.get(proxy)?.slots.get(flexTreeSlot);
	assert(existingFlexNode === undefined, "Cannot associate a flex node with multiple targets");
	if (flexNode instanceof RawTreeNode) {
		proxyToRawFlexNode.set(proxy, flexNode);
	} else {
		assert(
			tryGetProxy(flexNode) === undefined,
			0x7f5 /* Cannot associate an flex node with multiple targets */,
		);
		bindProxyToAnchorNode(proxy, flexNode.anchorNode);
	}
	return proxy;
}

/**
 * Bi-directionally associates the given proxy to the given anchor node.
 * @remarks Cleans up mappings to raw flex nodes - it is assumed that they are no longer needed once the proxy has an anchor node.
 */
function bindProxyToAnchorNode(proxy: TreeNode, anchorNode: AnchorNode): void {
	// If the proxy currently has a raw node, forget it
	proxyToRawFlexNode.delete(proxy);
	// Once a proxy has been associated with an anchor node, it should never change to another anchor node
	assert(
		!proxyToAnchorNode.has(proxy),
		"Proxy has already been bound to a different anchor node",
	);
	proxyToAnchorNode.set(proxy, anchorNode);
	// However, it's fine for an anchor node to rotate through different proxies when the content at that place in the tree is replaced.
	anchorNode.slots.set(proxySlot, proxy);
}
