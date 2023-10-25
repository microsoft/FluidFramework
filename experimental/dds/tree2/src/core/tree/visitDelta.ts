/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { assert } from "@fluidframework/core-utils";

import { FieldKey } from "../schema-stored";
import * as Delta from "./delta";
import { NodeIndex, PlaceIndex, Range } from "./pathTree";
import { ForestRootId, DetachedFieldIndex } from "./detachedFieldIndex";
import { areDetachedNodeIdsEqual, isAttachMark, isDetachMark, isReplaceMark } from "./deltaUtil";

/**
 * Implementation notes:
 *
 * The visit is organized into four phases:
 * 1. a detach pass
 * 2. root transfers
 * 3. an attach pass
 * 4. root destructions
 *
 * The core idea is that before content can be attached, it must first exist and be in a detached field.
 * The detach pass is therefore responsible for making sure that all roots that needs to be attached during the
 * attach pass are detached.
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
 *
 * While the detach pass ensures that nodes to be attached are in a detached state, it does not guarantee that they
 * reside in the correct detach field. That is the responsibility of the root transfers phase.
 *
 * The attach phase carries out attaches and replaces.
 *
 * After the attach phase, roots destruction is carried out.
 * This needs to happen last to allow modifications to detached roots to be applied before they are destroyed.
 */

/**
 * Crawls the given `delta`, calling `visitor`'s callback for each change encountered.
 * Each successive call to the visitor callbacks assumes that the change described by earlier calls have been applied
 * to the document tree. For example, for a change that removes the first and third node of a field, the visitor calls
 * will first call detach with a range from indices 0 to 1 then call detach with a range from indices 1 to 2.
 *
 * @param delta - The delta to be crawled.
 * @param visitor - The object to notify of the changes encountered.
 * @param detachedFieldIndex - Index responsible for keeping track of the existing detached fields.
 */
export function visitDelta(
	delta: Delta.Root,
	visitor: DeltaVisitor,
	detachedFieldIndex: DetachedFieldIndex,
): void {
	const detachPassRoots: Map<ForestRootId, Delta.FieldMap> = new Map();
	const attachPassRoots: Map<ForestRootId, Delta.FieldMap> = new Map();
	const rootTransfers: RootTransfers = new Map();
	const rootDestructions: Delta.DetachedNodeDestruction[] = [];
	const detachConfig: PassConfig = {
		func: detachPass,
		detachedFieldIndex,
		detachPassRoots,
		attachPassRoots,
		rootTransfers,
		rootDestructions,
	};
	visitFieldMarks(delta, visitor, detachConfig);
	fixedPointVisitOfRoots(visitor, detachPassRoots, detachConfig);
	transferRoots(rootTransfers, attachPassRoots, detachedFieldIndex, visitor);
	const attachConfig: PassConfig = {
		func: attachPass,
		detachedFieldIndex,
		detachPassRoots,
		attachPassRoots,
		rootTransfers,
		rootDestructions,
	};
	visitFieldMarks(delta, visitor, attachConfig);
	fixedPointVisitOfRoots(visitor, attachPassRoots, attachConfig);
	for (const { id, count } of rootDestructions) {
		for (let i = 0; i < count; i += 1) {
			const offsetId = offsetDetachId(id, i);
			const root = detachedFieldIndex.getEntry(offsetId);
			const field = detachedFieldIndex.toFieldKey(root);
			visitor.destroy(field, 1);
			detachedFieldIndex.deleteEntry(offsetId);
		}
	}
}

type RootTransfers = Map<
	ForestRootId,
	{
		/**
		 * The node ID that characterizes the detached field of origin.
		 * Used to delete the entry from the tree index once the root is transferred.
		 */
		oldId: Delta.DetachedNodeId;
		newId: Delta.DetachedNodeId;
	}
>;

/**
 * Visits all nodes in `roots` until none are left.
 * This function tolerates entries being added to and removed from `roots` as part of visits.
 * @param visitor - The visitor to visit the roots with.
 * @param roots - The initial set of roots to visit.
 * Individual entries are removed prior to being visited.
 * @param config - The configuration to use for visits.
 */
function fixedPointVisitOfRoots(
	visitor: DeltaVisitor,
	roots: Map<ForestRootId, Delta.FieldMap>,
	config: PassConfig,
) {
	while (roots.size > 0) {
		for (const [root, modifications] of roots) {
			roots.delete(root);
			const field = config.detachedFieldIndex.toFieldKey(root);
			visitor.enterField(field);
			// Note: each visit may lead to `roots` being populated with new entries or having some entries removed.
			visitNode(0, modifications, visitor, config);
			visitor.exitField(field);
		}
	}
}

/**
 * Transfers roots from one detached field to another.
 * TODO#5481: update the DetachedFieldIndex instead of moving the nodes around.
 *
 * @param rootTransfers - The transfers to perform.
 * Entries are removed as they are performed.
 * @param mapToUpdate - A map to update based on the transfers being performed.
 * @param detachedFieldIndex - The index to update based on the transfers being performed.
 * @param visitor - The visitor to inform of the transfers being performed.
 */
function transferRoots(
	rootTransfers: RootTransfers,
	mapToUpdate: Map<ForestRootId, unknown>,
	detachedFieldIndex: DetachedFieldIndex,
	visitor: DeltaVisitor,
): void {
	while (rootTransfers.size > 0) {
		const priorSize = rootTransfers.size;
		for (const [oldRootId, { oldId, newId }] of rootTransfers) {
			if (detachedFieldIndex.tryGetEntry(newId) !== undefined) {
				// The destination field is already occupied.
				// This can happen when its contents also need to be relocated.
				// We'll try this transfer again on the next pass.
			} else {
				rootTransfers.delete(oldRootId);
				const newRootId = detachedFieldIndex.createEntry(newId);
				const fields = mapToUpdate.get(oldRootId);
				if (fields !== undefined) {
					mapToUpdate.delete(oldRootId);
					mapToUpdate.set(newRootId, fields);
				}
				const oldField = detachedFieldIndex.toFieldKey(oldRootId);
				const newField = detachedFieldIndex.toFieldKey(newRootId);
				visitor.enterField(oldField);
				visitor.detach({ start: 0, end: 1 }, newField);
				visitor.exitField(oldField);
				detachedFieldIndex.deleteEntry(oldId);
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
	/**
	 * Frees/releases the visitor. Must be called once the visitor is no longer needed, since trying to acquire
	 * a new one before freeing an existing one is invalid.
	 */
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

	/**
	 * Tells the visitor that it should update its "current location" to be the Node at the specified index
	 * within the Field that is the current "current location".
	 * Future calls to methods of {@link DeltaVisitor} will assume that's the location where their effects are happening.
	 * @param index - The index (within the Field) of the node that should become the new "current location".
	 *
	 * @remarks This should only be called when the "current location" is a Field.
	 */
	enterNode(index: NodeIndex): void;

	/**
	 * Tells the visitor that it should update its "current location" to be the Field which contains the Node
	 * that is the current "current location".
	 * Future calls to methods of {@link DeltaVisitor} will assume that's the location where their effects are happening.
	 * @param index - The index (within its Field) of the node that is being exited.
	 *
	 * @remarks This should only be called when the "current location" is a Node.
	 */
	exitNode(index: NodeIndex): void;

	/**
	 * Tells the visitor that it should update its "current location" to be the Field with the specified key,
	 * within the Node that is the current "current location".
	 * Future calls to methods of {@link DeltaVisitor} will assume that's the location where their effects are happening.
	 * @param key - The key of the field that should become the new "current location".
	 *
	 * @remarks This should only be called when the "current location" is a Node.
	 */
	enterField(key: FieldKey): void;

	/**
	 * Tells the visitor that it should update its "current location" to be the Node which contains the Field
	 * that is the current "current location".
	 * Future calls to methods of {@link DeltaVisitor} will assume that's the location where their effects are happening.
	 * @param key - The key of the field that is being exited.
	 *
	 * @remarks This should only be called when the "current location" is a Field.
	 */
	exitField(key: FieldKey): void;
}

interface PassConfig {
	readonly func: Pass;
	readonly detachedFieldIndex: DetachedFieldIndex;

	/**
	 * Nested changes on roots that need to be visited as part of the detach pass.
	 * Each entry is removed when its associated changes are visited.
	 */
	readonly detachPassRoots: Map<ForestRootId, Delta.FieldMap>;
	/**
	 * Nested changes on roots that need to be visited as part of the attach pass.
	 * Each entry is removed when its associated changes are visited.
	 * Some of these roots will attached during the attach pass, in which case the nested changes are visited after
	 * the node is attached.
	 * Some of these nodes will never be attached, in which case we visit them in their detached fields at the end of
	 * the attach pass. Note that such a visit might lead to more nodes being attached, including nodes were visited as
	 * roots.
	 */
	readonly attachPassRoots: Map<ForestRootId, Delta.FieldMap>;
	/**
	 * Represents transfers of roots from one detached field to another.
	 */
	readonly rootTransfers: RootTransfers;
	/**
	 * Represents roots that need to be destroyed.
	 * Collected as part of the detach pass.
	 * Carried out at the end of the attach pass.
	 */
	readonly rootDestructions: Delta.DetachedNodeDestruction[];
}

type Pass = (delta: Delta.FieldChanges, visitor: DeltaVisitor, config: PassConfig) => void;

function visitFieldMarks(fields: Delta.FieldMap, visitor: DeltaVisitor, config: PassConfig): void {
	for (const [key, field] of fields) {
		visitor.enterField(key);
		config.func(field, visitor, config);
		visitor.exitField(key);
	}
}

function visitNode(
	index: number,
	fields: Delta.FieldMap | undefined,
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
 * Performs the following:
 * - Performs all root creations
 * - Collects all roots that may need a detach pass
 * - Collects all roots that may need an attach pass
 * - Collects all relocates
 * - Collects all destructions
 * - Executes detaches (bottom-up) provided they are not part of a replace
 * (because we want to wait until we are sure content to attach is available as a root)
 */
function detachPass(delta: Delta.FieldChanges, visitor: DeltaVisitor, config: PassConfig): void {
	if (delta.build !== undefined) {
		for (const { id, trees } of delta.build) {
			for (let i = 0; i < trees.length; i += 1) {
				const root = config.detachedFieldIndex.createEntry(offsetDetachId(id, i));
				const field = config.detachedFieldIndex.toFieldKey(root);
				visitor.create([trees[i]], field);
			}
		}
	}
	if (delta.destroy !== undefined) {
		config.rootDestructions.push(...delta.destroy);
	}
	if (delta.global !== undefined) {
		for (const { id, fields } of delta.global) {
			const root = config.detachedFieldIndex.getOrCreateEntry(id);
			config.detachPassRoots.set(root, fields);
			config.attachPassRoots.set(root, fields);
		}
	}
	if (delta.rename !== undefined) {
		for (const { oldId, count, newId } of delta.rename) {
			// It's possible for a detached node to be revived transiently such that it ends up back in the same detached field.
			// Making such a transfer wouldn't just be inefficient, it would lead us to mistakenly think we have moved all content
			// out of the source detached field, and would lead us to delete the tree index entry for that source detached field.
			// This would effectively result in the tree index missing an entry for the detached field.
			// This if statement prevents that from happening.
			if (!areDetachedNodeIdsEqual(oldId, newId)) {
				for (let i = 0; i < count; i += 1) {
					const ithOldId = offsetDetachId(oldId, i);
					const ithNewId = offsetDetachId(newId, i);
					const sourceRoot = config.detachedFieldIndex.getOrCreateEntry(ithOldId);
					config.rootTransfers.set(sourceRoot, {
						oldId: ithOldId,
						newId: ithNewId,
					});
				}
			}
		}
	}
	if (delta.local !== undefined) {
		let index = 0;
		for (const mark of delta.local) {
			if (mark.fields !== undefined) {
				assert(
					mark.attach === undefined || mark.detach !== undefined,
					"Invalid nested changes on an additive mark",
				);
				visitNode(index, mark.fields, visitor, config);
			}
			if (isDetachMark(mark)) {
				for (let i = 0; i < mark.count; i += 1) {
					const root = config.detachedFieldIndex.getOrCreateEntry(
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						offsetDetachId(mark.detach!, i),
					);
					if (mark.fields !== undefined) {
						config.attachPassRoots.set(root, mark.fields);
					}
					const field = config.detachedFieldIndex.toFieldKey(root);
					visitor.detach({ start: index, end: index + 1 }, field);
				}
			} else if (!isAttachMark(mark)) {
				index += mark.count;
			}
		}
	}
}

/**
 * Preforms the following:
 * - Executes attaches (top-down) applying nested changes on the attached nodes
 * - Executes replaces (top-down) applying nested changes on the attached nodes
 * - Collects detached roots (from replaces) that need an attach pass
 */
function attachPass(delta: Delta.FieldChanges, visitor: DeltaVisitor, config: PassConfig): void {
	if (delta.local !== undefined) {
		let index = 0;
		for (const mark of delta.local) {
			if (isAttachMark(mark) || isReplaceMark(mark)) {
				for (let i = 0; i < mark.count; i += 1) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const offsetAttachId = offsetDetachId(mark.attach!, i);
					const sourceRoot = config.detachedFieldIndex.getEntry(offsetAttachId);
					const sourceField = config.detachedFieldIndex.toFieldKey(sourceRoot);
					if (isReplaceMark(mark)) {
						const rootDestination = config.detachedFieldIndex.getOrCreateEntry(
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							offsetDetachId(mark.detach!, i),
						);
						const destinationField =
							config.detachedFieldIndex.toFieldKey(rootDestination);
						visitor.replace(
							sourceField,
							{ start: index, end: index + 1 },
							destinationField,
						);
						// We may need to do a second pass on the detached nodes
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
			} else if (!isDetachMark(mark) && mark.fields !== undefined) {
				visitNode(index, mark.fields, visitor, config);
			}
			if (!isDetachMark(mark)) {
				index += mark.count;
			}
		}
	}
}
