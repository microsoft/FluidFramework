/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ExclusiveMapTree,
	SchemaAndPolicy,
	IForestSubscription,
	MapTree,
	UpPath,
	NodeIndex,
	FieldKey,
	DetachedField,
} from "../core/index.js";
import {
	type FlexTreeContext,
	getSchemaAndPolicy,
	type FlexTreeHydratedContext,
} from "../feature-libraries/index.js";
import type { ImplicitAllowedTypes, ImplicitFieldSchema } from "./schemaTypes.js";
import { type InsertableContent, mapTreeFromNodeData } from "./toMapTree.js";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { brand } from "../util/index.js";
import {
	getKernel,
	type TreeNode,
	tryUnhydratedFlexTreeNode,
	unhydratedFlexTreeNodeToTreeNode,
} from "./core/index.js";
import { debugAssert, oob } from "@fluidframework/core-utils/internal";

/**
 * Prepare content from a user for insertion into a tree.
 * @remarks
 * This validates and converts the input, and if necessary invokes {@link prepareContentForHydration}.
 *
 * The next edit made to `destinationContext`'s forest must be the creation of a detached field containing this content,
 * (Triggering {@link ForestEvents.afterRootFieldCreated}) otherwise hydration will break.
 */
export function prepareForInsertion<TIn extends InsertableContent | undefined>(
	data: TIn,
	schema: ImplicitFieldSchema,
	destinationContext: FlexTreeContext,
): TIn extends undefined ? undefined : ExclusiveMapTree {
	return prepareForInsertionContextless(
		data,
		schema,
		getSchemaAndPolicy(destinationContext),
		destinationContext.isHydrated() ? destinationContext : undefined,
	);
}

/**
 * {@link prepareForInsertion} but batched for array content.
 * @remarks
 * This is for inserting items into an array, not a inserting a {@link TreeArrayNode} (that would use {@link prepareForInsertion}).
 *
 * The next edits made to `destinationContext`'s forest must be the creation of a detached field.
 * One edit for each item in `data`, in order.
 *
 * @privateRemarks
 * This has to be done as a single operation for all items in data
 * (as opposed to mapping {@link prepareForInsertion} over the array)
 * due to how the eventing in prepareContentForHydration works.
 */
export function prepareArrayContentForInsertion(
	data: readonly InsertableContent[],
	schema: ImplicitAllowedTypes,
	destinationContext: FlexTreeContext,
): ExclusiveMapTree[] {
	const mapTrees: ExclusiveMapTree[] = data.map((item) =>
		mapTreeFromNodeData(
			item,
			schema,
			destinationContext.isHydrated() ? destinationContext.nodeKeyManager : undefined,
			getSchemaAndPolicy(destinationContext),
		),
	);

	if (destinationContext.isHydrated()) {
		prepareContentForHydration(mapTrees, destinationContext.checkout.forest);
	}

	return mapTrees;
}

/**
 * Split out from {@link prepareForInsertion} as to allow use without a context.
 * @remarks
 * Adding this entry point is a workaround for initialize not currently having a context.
 */
export function prepareForInsertionContextless<TIn extends InsertableContent | undefined>(
	data: TIn,
	schema: ImplicitFieldSchema,
	schemaAndPolicy: SchemaAndPolicy,
	hydratedData: Pick<FlexTreeHydratedContext, "checkout" | "nodeKeyManager"> | undefined,
): TIn extends undefined ? undefined : ExclusiveMapTree {
	const mapTree = mapTreeFromNodeData(
		data,
		schema,
		hydratedData?.nodeKeyManager,
		schemaAndPolicy,
	);

	if (mapTree !== undefined && hydratedData !== undefined) {
		prepareContentForHydration([mapTree], hydratedData.checkout.forest);
	}

	return mapTree as TIn extends undefined ? undefined : ExclusiveMapTree;
}

/**
 * An {@link UpPath} that is just index zero in a {@link DetachedField} which can be modified at a later time.
 */
interface Root extends UpPath {
	readonly parent: undefined;
	parentField: DetachedField & FieldKey;
	readonly parentIndex: NodeIndex & 0;
}

/**
 * The path from the included node to the root of the content tree it was inserted as part of.
 */
interface RelativeNodePath {
	readonly path: UpPath;
	readonly node: TreeNode;
}

/**
 * {@link RelativeNodePath}s for every {@link TreeNode} in the content tree inserted as an atomic operation.
 */
interface LocatedNodesBatch {
	/**
	 * UpPath shared by all {@link RelativeNodePath}s in this batch corresponding to the root of the inserted content.
	 */
	readonly rootPath: Root;
	readonly paths: RelativeNodePath[];
}

/**
 * A dummy key value used in {@link LocatedNodesBatch.rootPath} which will be replaced with the actual detached field once it is known.
 */
const placeholderKey: DetachedField & FieldKey = brand("placeholder" as const);

/**
 * Records any proxies in the given content tree and does the necessary bookkeeping to ensure they are synchronized with subsequent reads of the tree.
 * @remarks If the content tree contains any proxies, this function must be called just prior to inserting the content into the tree.
 * Specifically, no other content may be inserted into the tree between the invocation of this function and the insertion of `content`.
 * The insertion of `content` must occur or else this function will cause memory leaks.
 * @param content - the content subsequence to be inserted, of which might deeply contain {@link TreeNode}s which need to be hydrated.
 * @param forest - the forest the content is being inserted into.
 * See {@link extractFactoryContent} for more details.
 */
function prepareContentForHydration(
	content: readonly MapTree[],
	forest: IForestSubscription,
): void {
	const batches: LocatedNodesBatch[] = [];
	for (const item of content) {
		const batch: LocatedNodesBatch = {
			rootPath: {
				parent: undefined,
				parentField: placeholderKey,
				parentIndex: 0,
			},
			paths: [],
		};
		batches.push(batch);
		walkMapTree(item, batch.rootPath, (p, node) => {
			batch.paths.push({ path: p, node });
		});
	}

	scheduleHydration(batches, forest);
}

function walkMapTree(
	mapTree: MapTree,
	path: UpPath,
	onVisitTreeNode: (path: UpPath, treeNode: TreeNode) => void,
): void {
	if (tryUnhydratedFlexTreeNode(mapTree)?.parentField.parent.parent !== undefined) {
		throw new UsageError(
			"Attempted to insert a node which is already under a parent. If this is desired, remove the node from its parent before inserting it elsewhere.",
		);
	}

	type Next = [path: UpPath, tree: MapTree];
	const nexts: Next[] = [];
	for (let next: Next | undefined = [path, mapTree]; next !== undefined; next = nexts.pop()) {
		const [p, m] = next;
		const mapTreeNode = tryUnhydratedFlexTreeNode(m);
		if (mapTreeNode !== undefined) {
			const treeNode = unhydratedFlexTreeNodeToTreeNode.get(mapTreeNode);
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

/**
 * Register events which will hydrate batches of nodes when they are inserted, assuming the next edits to forest are their insertions, in order.
 * @param locatedNodes - the nodes to register with the forest.
 * Each index in this array expects its content to be added and produce its own `afterRootFieldCreated` event.
 * If array subsequence insertion is optimized to produce a single event, this will not work correctly as is, and will need to be modified to take in a single {@link LocatedNodesBatch}.
 */
function scheduleHydration(
	locatedNodes: readonly LocatedNodesBatch[],
	forest: IForestSubscription,
): void {
	// Only subscribe to the event if there is at least one TreeNode tree to hydrate - this is not the case when inserting an empty array [].
	if (locatedNodes.length > 0) {
		// Creating a new array emits one event per element in the array, so listen to the event once for each element
		let i = 0;
		const off = forest.events.on("afterRootFieldCreated", (fieldKey) => {
			// Indexing is safe here because of the length check above. This assumes the array has not been modified which should be the case.
			const batch = locatedNodes[i] ?? oob();
			debugAssert(() => batch.rootPath.parentField === placeholderKey);
			batch.rootPath.parentField = brand(fieldKey);
			for (const { path, node } of batch.paths) {
				getKernel(node).hydrate(forest.anchors, path);
			}
			if (++i === locatedNodes.length) {
				off();
			}
		});
	}
}
