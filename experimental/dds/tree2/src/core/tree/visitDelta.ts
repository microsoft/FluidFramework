/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";

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
	const detachPassRoots: Map<ForestRootId, Delta.FieldsChanges> = new Map();
	const attachPassRoots: Map<ForestRootId, Delta.FieldsChanges> = new Map();
	const rootTransfers: RootTransfers = new Map();
	const detachConfig: PassConfig = {
		func: detachPass,
		detachedFieldIndex,
		detachPassRoots,
		attachPassRoots,
		rootTransfers,
	};
	visitFieldMarks(delta, visitor, detachConfig);
	visitRoots(visitor, detachPassRoots, detachConfig);
	transferRoots(rootTransfers, attachPassRoots, detachedFieldIndex, visitor);
	const attachConfig: PassConfig = {
		func: attachPass,
		detachPassRoots,
		attachPassRoots,
		detachedFieldIndex,
		rootTransfers,
	};
	visitFieldMarks(delta, visitor, attachConfig);
	visitRoots(visitor, attachPassRoots, attachConfig);
}

type RootTransfers = Map<
	ForestRootId,
	{
		/**
		 * The node ID that characterizes the detached field of origin.
		 * Used to delete the entry from the tree index once the root is transferred.
		 * If undefined, the root was created due to an insert.
		 */
		originId: Delta.DetachedNodeId;
		destinationId: Delta.DetachedNodeId;
	}
>;

function visitRoots(
	visitor: DeltaVisitor,
	roots: Map<ForestRootId, Delta.FieldsChanges>,
	config: PassConfig,
) {
	while (roots.size > 0) {
		for (const [root, modifications] of roots) {
			roots.delete(root);
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
): void {
	while (rootTransfers.size > 0) {
		const priorSize = rootTransfers.size;
		for (const [source, { originId, destinationId }] of rootTransfers) {
			if (detachedFieldIndex.tryGetEntry(destinationId) !== undefined) {
				// The destination field is already occupied.
				// This can happen when its contents also need to be relocated.
				// We'll try this transfer again on the next pass.
			} else {
				rootTransfers.delete(source);
				const destination = detachedFieldIndex.createEntry(destinationId);
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
				detachedFieldIndex.deleteEntry(originId);
			}
		}
		assert(rootTransfers.size < priorSize, "transferRoots should make progress");
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
	readonly func: Pass;
	readonly detachedFieldIndex: DetachedFieldIndex;

	/**
	 * Nested changes on roots that need to be visited as part of the detach pass.
	 * Each entry is removed when its associated changes are visited.
	 */
	readonly detachPassRoots: Map<ForestRootId, Delta.FieldsChanges>;
	/**
	 * Nested changes on roots that need to be visited as part of the detach pass.
	 * Each entry is removed when its associated changes are visited.
	 * Some of these roots will attached during the attach pass, in which case the nested changes are visited after
	 * the attach.
	 * Some of these nodes will never be attached, in which case we visit them in their detached fields at the end of
	 * the attach pass.
	 */
	readonly attachPassRoots: Map<ForestRootId, Delta.FieldsChanges>;
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
	readonly rootTransfers: RootTransfers;
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
			for (let i = 0; i < trees.length; i += 1) {
				const root = config.detachedFieldIndex.createEntry(
					offsetDetachId(id, i),
					trees.length,
				);
				const field = config.detachedFieldIndex.toFieldKey(root);
				visitor.create([trees[i]], field);
			}
		}
	}
	if (delta.detached !== undefined) {
		for (const { id, fields } of delta.detached) {
			const root = config.detachedFieldIndex.getOrCreateEntry(id);
			config.detachPassRoots.set(root, fields);
			config.attachPassRoots.set(root, fields);
		}
	}
	if (delta.relocate !== undefined) {
		for (const { id, count, destination } of delta.relocate) {
			// It's possible for a detached node to be revived transiently such that it ends up back in the same detached field.
			// Making such a transfer wouldn't just be inefficient, it would lead us to mistakenly think we have moved all content
			// out of the source detached field, and would lead us to delete the tree index entry for that source detached field.
			// This would effectively result in the tree index missing an entry for the detached field.
			// This if statement prevents that from happening.
			if (id.major !== destination.major || id.minor !== destination.minor) {
				for (let i = 0; i < count; i += 1) {
					const originId = offsetDetachId(id, i);
					const destinationId = offsetDetachId(destination, i);
					const sourceRoot = config.detachedFieldIndex.getOrCreateEntry(originId);
					config.rootTransfers.set(sourceRoot, {
						originId,
						destinationId,
					});
				}
			}
		}
	}
	if (delta.attached !== undefined) {
		let index = 0;
		for (const mark of delta.attached) {
			if (mark.fields !== undefined) {
				assert(
					mark.attach === undefined || mark.detach !== undefined,
					"Invalid nested changes on an additive mark",
				);
				visitNode(index, mark.fields, visitor, config);
			}
			if (mark.detach !== undefined) {
				if (mark.attach === undefined) {
					// This a simple detach
					for (let i = 0; i < mark.count; i += 1) {
						const root = config.detachedFieldIndex.getOrCreateEntry(
							offsetDetachId(mark.detach, i),
						);
						// We may need to do a second pass on the nodes, so keep track of the changes
						if (mark.fields !== undefined) {
							config.attachPassRoots.set(root, mark.fields);
						}
						const field = config.detachedFieldIndex.toFieldKey(root);
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
						const sourceRoot =
							config.detachedFieldIndex.getOrCreateEntry(offsetAttachId);
						const sourceField = config.detachedFieldIndex.toFieldKey(sourceRoot);
						if (mark.detach !== undefined) {
							// This is a true replace.
							const rootDestination = config.detachedFieldIndex.getOrCreateEntry(
								offsetDetachId(mark.detach, i),
							);
							const destinationField =
								config.detachedFieldIndex.toFieldKey(rootDestination);
							visitor.replace(
								sourceField,
								{ start: index, end: index + 1 },
								destinationField,
							);
							// We may need to do a second pass on the nodes, so keep track of the changes
							if (mark.fields !== undefined) {
								config.attachPassRoots.set(rootDestination, mark.fields);
							}
						} else {
							// This a simple attach
							visitor.attach(sourceField, 1, index + i);
						}
						config.detachedFieldIndex.deleteEntry(offsetAttachId);
						const fields = config.attachPassRoots.get(sourceRoot);
						if (fields !== undefined) {
							config.attachPassRoots.delete(sourceRoot);
							visitNode(index, fields, visitor, config);
						}
					}
				} else {
					if (mark.fields !== undefined) {
						visitNode(index, mark.fields, visitor, config);
					}
				}
				index += mark.count;
			}
		}
	}
}
