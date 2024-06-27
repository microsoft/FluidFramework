/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";

import {
	EmptyKey,
	type IForestSubscription,
	type MapTree,
	type TreeNodeSchemaIdentifier,
	type TreeValue,
	type UpPath,
} from "../core/index.js";

import {
	FieldKinds,
	type FlexFieldSchema,
	type FlexTreeField,
	type FlexTreeNode,
	type FlexTreeNodeEvents,
	type FlexTreeTypedField,
	type MapTreeNode,
	tryGetMapTreeNode,
	typeNameSymbol,
	isFlexTreeNode,
} from "../feature-libraries/index.js";
import { type Mutable, fail, isReadonlyArray } from "../util/index.js";

import { anchorProxy, tryGetFlexNode, tryGetProxy } from "./proxyBinding.js";
import { tryGetSimpleNodeSchema } from "./schemaCaching.js";
import type { TreeNode, Unhydrated } from "./types.js";
import type { Off } from "../events/index.js";

/**
 * Detects if the given 'candidate' is a TreeNode.
 *
 * @remarks
 * Supports both Hydrated and {@link Unhydrated} TreeNodes, both of which return true.
 *
 * Because the common usage is to check if a value being inserted/set is a TreeNode,
 * this function permits calling with primitives as well as objects.
 *
 * Primitives will always return false (as they are copies of data, not references to nodes).
 *
 * @param candidate - Value which may be a TreeNode
 * @returns true if the given 'candidate' is a hydrated TreeNode.
 */
export function isTreeNode(candidate: unknown): candidate is TreeNode | Unhydrated<TreeNode> {
	return tryGetFlexNode(candidate) !== undefined;
}

/**
 * Retrieve the associated proxy for the given field.
 * */
export function getProxyForField(field: FlexTreeField): TreeNode | TreeValue | undefined {
	function tryToUnboxLeaves(
		flexField: FlexTreeTypedField<
			FlexFieldSchema<typeof FieldKinds.required | typeof FieldKinds.optional>
		>,
	): TreeNode | TreeValue | undefined {
		const maybeUnboxedContent = flexField.content;
		return isFlexTreeNode(maybeUnboxedContent)
			? getOrCreateNodeProxy(maybeUnboxedContent)
			: maybeUnboxedContent;
	}
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const typedField = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.required>
			>;
			return tryToUnboxLeaves(typedField);
		}
		case FieldKinds.optional: {
			const typedField = field as FlexTreeTypedField<
				FlexFieldSchema<typeof FieldKinds.optional>
			>;
			return tryToUnboxLeaves(typedField);
		}
		// TODO: Remove if/when 'FieldNode' is removed.
		case FieldKinds.sequence: {
			// 'getProxyForNode' handles FieldNodes by unconditionally creating a array node proxy, making
			// this case unreachable as long as users follow the 'array recipe'.
			fail("'sequence' field is unexpected.");
		}
		case FieldKinds.identifier: {
			// Identifier fields are just value fields that hold strings
			return (field as FlexTreeTypedField<FlexFieldSchema<typeof FieldKinds.required>>)
				.content as string;
		}

		default:
			fail("invalid field kind");
	}
}

export function getOrCreateNodeProxy(flexNode: FlexTreeNode): TreeNode | TreeValue {
	const cachedProxy = tryGetProxy(flexNode);
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
	readonly mapTreeNode: MapTreeNode;
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

		walkMapTree(content, proxies.rootPath, (p, mapTreeNode, proxy) => {
			proxies.proxyPaths.push({ path: p, mapTreeNode, proxy });
		});

		bindProxies([proxies], forest);
	}
}

function prepareArrayContentForHydration(
	content: readonly MapTree[],
	forest: IForestSubscription,
): void {
	const proxies: RootedProxyPaths[] = [];
	for (let i = 0; i < content.length; i++) {
		proxies.push({
			rootPath: {
				parent: undefined,
				parentField: EmptyKey,
				parentIndex: 0,
			},
			proxyPaths: [],
		});
		walkMapTree(content[i], proxies[i].rootPath, (p, mapTreeNode, proxy) => {
			proxies[i].proxyPaths.push({ path: p, mapTreeNode, proxy });
		});
	}

	bindProxies(proxies, forest);
}

function walkMapTree(
	mapTree: MapTree,
	path: UpPath,
	onVisitTreeNode: (path: UpPath, mapTreeNode: MapTreeNode, treeNode: TreeNode) => void,
): void {
	const mapTreeNode = tryGetMapTreeNode(mapTree);
	if (mapTreeNode !== undefined) {
		const treeNode = tryGetProxy(mapTreeNode);
		if (treeNode !== undefined) {
			onVisitTreeNode(path, mapTreeNode, treeNode);
		}
	}

	for (const [key, field] of mapTree.fields) {
		for (let i = 0; i < field.length; i++) {
			walkMapTree(
				field[i],
				{
					parent: path,
					parentField: key,
					parentIndex: i,
				},
				onVisitTreeNode,
			);
		}
	}
}

function bindProxies(proxies: RootedProxyPaths[], forest: IForestSubscription): void {
	// Only subscribe to the event if there is at least one proxy tree to hydrate - this is not the case when inserting an empty array [].
	if (proxies.length > 0) {
		// Creating a new array emits one event per element in the array, so listen to the event once for each element
		let i = 0;
		const off = forest.on("afterRootFieldCreated", (fieldKey) => {
			(proxies[i].rootPath as Mutable<UpPath>).parentField = fieldKey;
			for (const { path, mapTreeNode, proxy } of proxies[i].proxyPaths) {
				const anchorNode = anchorProxy(forest.anchors, path, proxy);
				mapTreeNode.forwardEvents({
					on<K extends keyof FlexTreeNodeEvents>(
						eventName: K,
						listener: FlexTreeNodeEvents[K],
					): Off {
						switch (eventName) {
							case "nodeChanged": {
								return anchorNode.on("childrenChangedAfterBatch", listener);
							}
							case "treeChanged": {
								return anchorNode.on("subtreeChangedAfterBatch", listener);
							}
							default:
								fail("Unexpected event subscription");
						}
					},
				});
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
	| ReadonlyMap<string, InsertableContent>
	| readonly InsertableContent[]
	| {
			readonly [P in string]?: InsertableContent;
	  };

/**
 * Content which can be inserted into a tree.
 */
export type InsertableContent = Unhydrated<TreeNode> | FactoryContent;

/**
 * Brand `copy` with the type (under {@link typeNameSymbol}) to avoid ambiguity when inferring types from this data.
 */
export function markContentType(typeName: TreeNodeSchemaIdentifier, copy: object): void {
	Object.defineProperty(copy, typeNameSymbol, { value: typeName });
}
