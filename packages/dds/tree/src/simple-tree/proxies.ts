/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { assert } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	type IForestSubscription,
	type MapTree,
	type TreeValue,
	type UpPath,
} from "../core/index.js";

import {
	FieldKinds,
	type FlexTreeField,
	type FlexTreeNode,
	tryGetMapTreeNode,
	isFlexTreeNode,
	type FlexTreeRequiredField,
	type FlexTreeOptionalField,
} from "../feature-libraries/index.js";
import { type Mutable, fail, isReadonlyArray } from "../util/index.js";

import { anchorProxy, tryGetCachedTreeNode } from "./proxyBinding.js";
import { tryGetSimpleNodeSchema, type TreeNode, type Unhydrated } from "./core/index.js";

/**
 * Retrieve the associated {@link TreeNode} for the given field's content.
 */
export function getTreeNodeForField(field: FlexTreeField): TreeNode | TreeValue | undefined {
	function tryToUnboxLeaves(
		flexField: FlexTreeOptionalField | FlexTreeRequiredField,
	): TreeNode | TreeValue | undefined {
		const maybeContent = flexField.content;
		return isFlexTreeNode(maybeContent)
			? getOrCreateNodeFromFlexTreeNode(maybeContent)
			: maybeContent;
	}
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const typedField = field as FlexTreeRequiredField;
			return tryToUnboxLeaves(typedField);
		}
		case FieldKinds.optional: {
			const typedField = field as FlexTreeOptionalField;
			return tryToUnboxLeaves(typedField);
		}
		case FieldKinds.identifier: {
			// Identifier fields are just value fields that hold strings
			return (field as FlexTreeRequiredField).content as string;
		}

		default:
			fail("invalid field kind");
	}
}

export function getOrCreateNodeFromFlexTreeNode(flexNode: FlexTreeNode): TreeNode | TreeValue {
	const cachedProxy = tryGetCachedTreeNode(flexNode);
	if (cachedProxy !== undefined) {
		return cachedProxy;
	}

	const schema = flexNode.schema;
	const classSchema = tryGetSimpleNodeSchema(schema);
	assert(classSchema !== undefined, 0x91b /* node without schema */);
	if (typeof classSchema === "function") {
		const simpleSchema = classSchema as unknown as new (dummy: FlexTreeNode) => TreeNode;
		return new simpleSchema(flexNode);
	} else {
		return (classSchema as { create(data: FlexTreeNode): TreeNode }).create(flexNode);
	}
}

// #region Content insertion and proxy binding

/** The path of a proxy, relative to the root of the content tree that the proxy belongs to */
interface RelativeProxyPath {
	readonly path: UpPath;
	readonly proxy: TreeNode;
}

/** All {@link RelativeProxyPath}s that are under the given root path */
interface RootedProxyPaths {
	readonly rootPath: UpPath;
	readonly proxyPaths: RelativeProxyPath[];
}

/**
 * Records any proxies in the given content tree and does the necessary bookkeeping to ensure they are synchronized with subsequent reads of the tree.
 * @remarks If the content tree contains any proxies, this function must be called just prior to inserting the content into the tree.
 * Specifically, no other content may be inserted into the tree between the invocation of this function and the insertion of `content`.
 * The insertion of `content` must occur or else this function will cause memory leaks.
 * @param content - the tree of content to be inserted, of which any of its object/map/array nodes might be a proxy
 * @param anchors - the {@link AnchorSet} for the tree
 * @returns The content after having all proxies replaced inline with plain javascript objects.
 * See {@link extractFactoryContent} for more details.
 */
export function prepareContentForHydration(
	content: MapTree | readonly MapTree[] | undefined,
	forest: IForestSubscription,
): void {
	if (isReadonlyArray(content)) {
		return prepareArrayContentForHydration(content, forest);
	}

	if (content !== undefined) {
		const proxies: RootedProxyPaths = {
			rootPath: { parent: undefined, parentField: EmptyKey, parentIndex: 0 },
			proxyPaths: [],
		};

		walkMapTree(content, proxies.rootPath, (p, proxy) => {
			proxies.proxyPaths.push({ path: p, proxy });
		});

		bindProxies([proxies], forest);
	}
}

function prepareArrayContentForHydration(
	content: readonly MapTree[],
	forest: IForestSubscription,
): void {
	const proxyPaths: RootedProxyPaths[] = [];
	for (const item of content) {
		const proxyPath: RootedProxyPaths = {
			rootPath: {
				parent: undefined,
				parentField: EmptyKey,
				parentIndex: 0,
			},
			proxyPaths: [],
		};
		proxyPaths.push(proxyPath);
		walkMapTree(item, proxyPath.rootPath, (p, proxy) => {
			proxyPath.proxyPaths.push({ path: p, proxy });
		});
	}

	bindProxies(proxyPaths, forest);
}

function walkMapTree(
	mapTree: MapTree,
	path: UpPath,
	onVisitTreeNode: (path: UpPath, treeNode: TreeNode) => void,
): void {
	if (tryGetMapTreeNode(mapTree)?.parentField.parent.parent !== undefined) {
		throw new UsageError(
			"Attempted to insert a node which is already under a parent. If this is desired, remove the node from its parent before inserting it elsewhere.",
		);
	}

	type Next = [path: UpPath, tree: MapTree];
	const nexts: Next[] = [];
	for (let next: Next | undefined = [path, mapTree]; next !== undefined; next = nexts.pop()) {
		const [p, m] = next;
		const mapTreeNode = tryGetMapTreeNode(m);
		if (mapTreeNode !== undefined) {
			const treeNode = tryGetCachedTreeNode(mapTreeNode);
			if (treeNode !== undefined) {
				onVisitTreeNode(p, treeNode);
			}
		}

		for (const [key, field] of m.fields) {
			for (const [i, child] of field.entries()) {
				nexts.push([
					{
						parent: p,
						parentField: key,
						parentIndex: i,
					},
					child,
				]);
			}
		}
	}
}

function bindProxies(proxies: RootedProxyPaths[], forest: IForestSubscription): void {
	// Only subscribe to the event if there is at least one proxy tree to hydrate - this is not the case when inserting an empty array [].
	if (proxies.length > 0) {
		// Creating a new array emits one event per element in the array, so listen to the event once for each element
		let i = 0;
		const off = forest.on("afterRootFieldCreated", (fieldKey) => {
			// Non null asserting here because of the length check above
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			(proxies[i]!.rootPath as Mutable<UpPath>).parentField = fieldKey;
			// Non null asserting here because of the length check above
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			for (const { path, proxy } of proxies[i]!.proxyPaths) {
				anchorProxy(forest.anchors, path, proxy);
			}
			if (++i === proxies.length) {
				off();
			}
		});
	}
}

// #endregion Content insertion and proxy binding

/**
 * Content which can be used to build a node.
 * @remarks
 * Can contain unhydrated nodes, but can not be an unhydrated node at the root.
 */
export type FactoryContent =
	| IFluidHandle
	| string
	| number
	| boolean
	// eslint-disable-next-line @rushstack/no-new-null
	| null
	| Iterable<readonly [string, InsertableContent]>
	| readonly InsertableContent[]
	| {
			readonly [P in string]?: InsertableContent;
	  };

/**
 * Content which can be inserted into a tree.
 */
export type InsertableContent = Unhydrated<TreeNode> | FactoryContent;
