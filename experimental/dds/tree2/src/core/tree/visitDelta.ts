/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand } from "../../util";
import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import { NodeIndex, PlaceIndex, Range } from "./pathTree";
import { ForestRootId, DetachedFieldIndex } from "./detachedFieldIndex";

/**
 * Implementation notes:
 *
 * The visit is organized in two passes: a detach pass and an attach pass.
 * The core idea is that before content can be attached, it must first exist and be in a detached field.
 * The detach pass is therefore responsible for making sure that all roots that needs to be attached during the
 * attach pass are ready to be attached.
 * In practice, this means the detach pass must:
 * - Create all subtrees that need to be created
 * - Detach all moved nodes
 *
 * In addition to that, the detach pass also detaches nodes that need removing, with the exception of nodes that get
 * replaced. The reason for this exception is that we need to be able to communicate replaces as atomic operations.
 * In order to do that, we need to wait until we are sure that the content to attach is available as a detached root.
 * Replaces are therefore handled during the attach pass.
 * Note that this could theoretically lead to a situation where, in the attach pass, one replace wants to attach
 * a node that has yet to be detached by another replace. This does not occur in practice because we do not support
 * editing operations that would lead to this situation.
 */

/**
 * Crawls the given `delta`, calling `visitor`'s callback for each change encountered.
 * Each successive call to the visitor callbacks assumes that the change described by earlier calls have been applied
 * to the document tree. For example, for a change that removes the first and third node of a field, the visitor calls
 * will first call detach with a range from indices 0 to 1 then call detach with a range from indices 1 to 2.
 *
 * @param delta - The delta to be crawled.
 * @param visitor - The object to notify of the changes encountered.
 */
export function visitDelta(
	delta: Delta.Root,
	visitor: DeltaVisitor,
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const modsToMovedTrees: Map<ForestRootId, Delta.FieldsChanges> = new Map();
	const rootChanges: Map<ForestRootId, Delta.FieldsChanges> = new Map();
	const rootTransfers: RootTransfers = new Map();
	const detachConfig: PassConfig = {
		name: "detach",
		func: detachPass,
		modsToMovedTrees,
		detachedFieldIndex,
		rootChanges,
		rootToRootTransfers: rootTransfers,
	};
	visitFieldMarks(delta, visitor, detachConfig);
	visitDetachedRoots(visitor, detachConfig);
	transferRoots(rootTransfers, rootChanges, detachedFieldIndex, visitor);
	const attachConfig: PassConfig = {
		name: "attach",
		func: attachPass,
		modsToMovedTrees,
		detachedFieldIndex,
		rootChanges,
		rootToRootTransfers: rootTransfers,
	};
	visitFieldMarks(delta, visitor, attachConfig);
	visitDetachedRoots(visitor, attachConfig);
}

type RootTransfers = Map<
	ForestRootId,
	{
		/**
		 * The node ID that characterizes the detached field of origin.
		 * Used to delete the entry from the tree index once the root is transferred.
		 * If undefined, the root was created due to an insert.
		 */
		nodeId?: Delta.DetachedNodeId;
		destination: ForestRootId;
	}
>;

function visitDetachedRoots(visitor: DeltaVisitor, config: PassConfig) {
	while (config.rootChanges.size > 0) {
		for (const [root, modifications] of config.rootChanges) {
			config.rootChanges.delete(root);
			const field = config.detachedFieldIndex.toFieldKey(root);
			visitor.enterField(field);
			visitNode(0, modifications, visitor, config);
			visitor.exitField(field);
		}
	}
}

function transferRoots(
	rootTransfers: RootTransfers,
	rootChanges: Map<ForestRootId, Delta.FieldsChanges>,
	detachedFieldIndex: DetachedFieldIndex,
	visitor: DeltaVisitor,
) {
	for (const [source, { nodeId, destination }] of rootTransfers) {
		rootTransfers.delete(source);
		const fields = rootChanges.get(source);
		if (fields !== undefined) {
			rootChanges.delete(source);
			rootChanges.set(destination, fields);
		}
		const sourceField = detachedFieldIndex.toFieldKey(source);
		const destinationField = detachedFieldIndex.toFieldKey(destination);
		visitor.enterField(sourceField);
		visitor.detach({ start: 0, end: 1 }, destinationField);
		visitor.exitField(sourceField);
		if (nodeId !== undefined) {
			detachedFieldIndex.deleteEntry(nodeId);
		}
	}
}

/**
 * Visitor for changes in a delta.
 * Must be freed after use.
 * @alpha
 */
export interface DeltaVisitor {
	free(): void;
	/**
	 * Creates nodes for the given content in a new detached field.
	 * @param content - The content to create.
	 * @param destination - The key for a new detached field.
	 * A field with this key must not already exist.
	 */
	create(content: Delta.ProtoNodes, destination: FieldKey): void;
	/**
	 * Recursively destroys the given detached field and all of the nodes within it.
	 * @param detachedField - The key for the detached field to destroy.
	 * @param count - The number of nodes being destroyed.
	 * Expected to match the number of nodes in the detached field being destroyed.
	 */
	destroy(detachedField: FieldKey, count: number): void;
	/**
	 * Transfers all the nodes from a detached field to the current field.
	 * @param source - The detached field to transfer the nodes from.
	 * @param count - The number of nodes being attached.
	 * Expected to match the number of nodes in the source detached field.
	 * @param destination - The index at which to attach the nodes.
	 */
	attach(source: FieldKey, count: number, destination: PlaceIndex): void;
	/**
	 * Transfers a range of nodes from the current field to a new detached field.
	 * @param source - The bounds of the range of nodes to detach.
	 * @param destination - The key for a new detached field.
	 * A field with this key must not already exist.
	 */
	detach(source: Range, destination: FieldKey): void;
	/**
	 * Replaces a range of nodes in the current field by transferring them out to a new detached field
	 * and transferring in all the nodes from an existing detached field in their place.
	 * The number of nodes being detached must match the number of nodes being attached.
	 * @param newContentSource - The detached field to transfer the new nodes from.
	 * @param range - The bounds of the range of nodes to replace.
	 * @param oldContentDestination - The key for a new detached field to transfer the old nodes to.
	 */
	replace(newContentSource: FieldKey, range: Range, oldContentDestination: FieldKey): void;

	enterNode(index: NodeIndex): void;
	exitNode(index: NodeIndex): void;
	enterField(key: FieldKey): void;
	exitField(key: FieldKey): void;
}

interface PassConfig {
	readonly name: "detach" | "attach";
	readonly func: Pass;
	readonly detachedFieldIndex: DetachedFieldIndex;

	/**
	 * Nested changes that need to be applied to detached roots.
	 * In the detach pass, this is used for:
	 * - Changes under newly created trees (since they are created in a detached field)
	 * - Changes under existing trees that start out as being removed (no matter what happens to them during this visit)
	 * In the attach pass, this is used for:
	 * - Changes under trees end up as removed as part of this visit (no matter what happened to them during this visit)
	 */
	readonly rootChanges: Map<ForestRootId, Delta.FieldsChanges>;
	/**
	 * Represents transfers of roots from one detached field to another.
	 * In the detach pass, this is used for:
	 * - Transferring a removed node (that is being moved) to the detached field that corresponds to the move ID
	 * In the attach pass, this is used for:
	 * - Transferring a created node (that is transient) to the detached field that corresponds to its detach ID
	 * - Transferring a restored node (that is transient) to the detached field that corresponds to its detach ID
	 * - Transferring a moved node (that is removed) to the detached field that corresponds to its detach ID
	 * TODO#5481: update the DetachedFieldIndex instead of moving the nodes around.
	 */
	readonly rootToRootTransfers: RootTransfers;
	/**
	 * Stores the nested changes for all moved trees.
	 */
	readonly modsToMovedTrees: Map<ForestRootId, Delta.FieldsChanges>;
}

type Pass = (delta: Delta.FieldChanges, visitor: DeltaVisitor, config: PassConfig) => void;

function visitFieldMarks(
	fields: Delta.FieldsChanges,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	for (const [key, field] of fields) {
		visitor.enterField(key);
		config.func(field, visitor, config);
		visitor.exitField(key);
	}
}

function visitNode(
	index: number,
	fields: Delta.FieldsChanges | undefined,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	if (fields !== undefined) {
		visitor.enterNode(index);
		visitFieldMarks(fields, visitor, config);
		visitor.exitNode(index);
	}
}

function offsetDetachId(detachId: Delta.DetachedNodeId, offset: number): Delta.DetachedNodeId;
function offsetDetachId(
	detachId: Delta.DetachedNodeId | undefined,
	offset: number,
): Delta.DetachedNodeId | undefined;
function offsetDetachId(
	detachId: Delta.DetachedNodeId | undefined,
	offset: number,
): Delta.DetachedNodeId | undefined {
	if (detachId === undefined) {
		return undefined;
	}
	return {
		...detachId,
		minor: detachId.minor + offset,
	};
}

function addRootReplaces(
	count: number,
	config: PassConfig,
	destination: ForestRootId,
	source: ForestRootId,
	sourceNodeId?: Delta.DetachedNodeId,
) {
	// It's possible for a detached node to be revived transiently such that it ends up back in the same detached field.
	// Making such a transfer wouldn't just be inefficient, it would lead us to mistakenly think we have moved all content
	// out of the source detached field, and would lead us to delete the tree index entry for that source detached field.
	// This would effectively result in the tree index missing an entry for the detached field.
	// This if statement prevents that from happening.
	if (source !== destination) {
		for (let i = 0; i < count; i += 1) {
			config.rootToRootTransfers.set(brand(source + i), {
				destination: brand(destination + i),
				nodeId: offsetDetachId(sourceNodeId, i),
			});
		}
	}
}

/**
 * Preforms the following:
 * - Performs all root creations
 * - Collects all roots that may need a detach pass
 * - Collects all relocates
 * - Executes detaches (bottom-up) provided they are not part of a replace
 * (because we want to wait until we are sure content to attach is available as a root)
 */
function detachPass(delta: Delta.FieldChanges, visitor: DeltaVisitor, config: PassConfig): void {
	if (delta.build !== undefined) {
		for (const { id, trees } of delta.build) {
			visitor.create(trees, config.detachedFieldIndex.createEntry(id, trees.length).field);
		}
	}
	if (delta.detached !== undefined) {
		for (const { id, fields } of delta.detached) {
			const { root } = config.detachedFieldIndex.getOrCreateEntry(id);
			config.rootChanges.set(root, fields);
		}
	}
	if (delta.relocate !== undefined) {
		for (const { id, count, destination } of delta.relocate) {
			const { root: sourceRoot } = config.detachedFieldIndex.getOrCreateEntry(id);
			const { root: destinationRoot } =
				config.detachedFieldIndex.getOrCreateEntry(destination);
			addRootReplaces(count, config, destinationRoot, sourceRoot, id);
		}
	}
	if (delta.attached !== undefined) {
		let index = 0;
		for (const mark of delta.attached) {
			if (mark.fields !== undefined) {
				visitNode(index, mark.fields, visitor, config);
			}
			if (mark.detach !== undefined) {
				const { root } = config.detachedFieldIndex.getOrCreateEntry(mark.detach);
				// We may need to do a second pass on the nodes, so keep track of the changes
				if (mark.fields !== undefined) {
					config.modsToMovedTrees.set(root, mark.fields);
				}
				if (mark.attach === undefined) {
					// This a simple detach
					for (let i = 0; i < mark.count; i += 1) {
						const field = config.detachedFieldIndex.toFieldKey(brand(root + i));
						visitor.detach({ start: index, end: index + 1 }, field);
					}
				} else {
					// This really is a replace.
					// Delay the detach until we can do it during the attach pass.
					index += mark.count;
				}
			} else if (mark.attach === undefined) {
				index += mark.count;
			}
		}
	}
}

/**
 * Preforms the following:
 * - Collects all roots that need an attach pass
 * - Executes attaches (top-down)
 * - Executes replaces (top-down)
 */
function attachPass(delta: Delta.FieldChanges, visitor: DeltaVisitor, config: PassConfig): void {
	if (delta.attached !== undefined) {
		let index = 0;
		for (const mark of delta.attached) {
			if (mark.detach === undefined || mark.attach !== undefined) {
				if (mark.attach !== undefined) {
					for (let i = 0; i < mark.count; i += 1) {
						const offsetAttachId = offsetDetachId(mark.attach, i);
						const { field: sourceField } =
							config.detachedFieldIndex.getOrCreateEntry(offsetAttachId);
						if (mark.detach !== undefined) {
							// This is a true replace.
							const { field: destinationField } =
								config.detachedFieldIndex.getOrCreateEntry(
									offsetDetachId(mark.detach, i),
								);
							visitor.replace(
								sourceField,
								{ start: index, end: index + 1 },
								destinationField,
							);
						} else {
							// This a simple attach
							visitor.attach(sourceField, 1, index + i);
						}
						config.detachedFieldIndex.deleteEntry(offsetAttachId);
					}
				}
				if (mark.fields !== undefined) {
					visitNode(index, mark.fields, visitor, config);
				}
				index += mark.count;
			}
		}
	}
}
