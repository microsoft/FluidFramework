/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { type NestedMap, setInNestedMap, tryGetFromNestedMap } from "../../util/index.js";
import type { FieldKey } from "../schema-stored/index.js";

import type { ITreeCursorSynchronous } from "./cursor.js";
// eslint-disable-next-line import/no-duplicates
import type * as Delta from "./delta.js";
// Since ProtoNodes is reexported, import it directly to avoid forcing Delta to be reexported.
// eslint-disable-next-line import/no-duplicates
import type { ProtoNodes } from "./delta.js";
import {
	areDetachedNodeIdsEqual,
	isAttachMark,
	isDetachMark,
	isReplaceMark,
	offsetDetachId,
} from "./deltaUtil.js";
import type { DetachedFieldIndex } from "./detachedFieldIndex.js";
import type { ForestRootId, Major, Minor } from "./detachedFieldIndexTypes.js";
import type { NodeIndex, PlaceIndex, Range } from "./pathTree.js";
import type { RevisionTag } from "../index.js";

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
 *
 * The details of the delta visit algorithm can impact how/when events are emitted by the objects that own the visitors.
 * For example, as of 2024-03-27, the subtreecChanged event of an AnchorNode is emitted when exiting a node during a
 * delta visit, and thus the two-pass nature of the algorithm means the event fires twice for any given change.
 * This two-pass nature also means that the event may fire at a time where no change is visible in the tree. E.g.,
 * if a node is being replaced, when the event fires during the detach pass no change in the tree has happened so the
 * listener won't see any; then when it fires during the attach pass, the change will be visible in the event listener.
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
 * @param latestRevision - The latest revision tag associated with this delta.
 */
export function visitDelta(
	delta: Delta.Root,
	visitor: DeltaVisitor,
	detachedFieldIndex: DetachedFieldIndex,
	latestRevision: RevisionTag | undefined,
): void {
	const detachPassRoots: Map<ForestRootId, Delta.FieldMap> = new Map();
	const attachPassRoots: Map<ForestRootId, Delta.FieldMap> = new Map();
	const rootTransfers: Delta.DetachedNodeRename[] = [];
	const rootDestructions: Delta.DetachedNodeDestruction[] = [];
	const refreshers: NestedMap<Major, Minor, ITreeCursorSynchronous> = new Map();
	delta.refreshers?.forEach(({ id: { major, minor }, trees }) => {
		for (let i = 0; i < trees.length; i += 1) {
			const offsettedId = minor + i;
			setInNestedMap(refreshers, major, offsettedId, trees[i]);
		}
	});
	const detachConfig: PassConfig = {
		func: detachPass,
		latestRevision,
		refreshers,
		detachedFieldIndex,
		detachPassRoots,
		attachPassRoots,
		rootTransfers,
		rootDestructions,
	};
	processBuilds(delta.build, detachConfig, visitor);
	processGlobal(delta.global, detachConfig, visitor);
	processRename(delta.rename, detachConfig);
	visitFieldMarks(delta.fields, visitor, detachConfig);
	fixedPointVisitOfRoots(visitor, detachPassRoots, detachConfig);
	transferRoots(
		rootTransfers,
		attachPassRoots,
		detachedFieldIndex,
		visitor,
		refreshers,
		latestRevision,
	);
	const attachConfig: PassConfig = {
		func: attachPass,
		latestRevision,
		refreshers,
		detachedFieldIndex,
		detachPassRoots,
		attachPassRoots,
		rootTransfers,
		rootDestructions,
	};
	visitFieldMarks(delta.fields, visitor, attachConfig);
	fixedPointVisitOfRoots(visitor, attachPassRoots, attachConfig);
	collectDestroys(delta.destroy, attachConfig);
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
): void {
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
 * This occurs in the following circumstances:
 * - A changeset moves then removes a node
 * - A changeset restores then moves a node
 * - A changeset restores then removes a node
 * TODO#5481: update the DetachedFieldIndex instead of moving the nodes around.
 *
 * @param rootTransfers - The transfers to perform.
 * @param mapToUpdate - A map to update based on the transfers being performed.
 * @param detachedFieldIndex - The index to update based on the transfers being performed.
 * @param visitor - The visitor to inform of the transfers being performed.
 */
function transferRoots(
	rootTransfers: readonly Delta.DetachedNodeRename[],
	mapToUpdate: Map<ForestRootId, unknown>,
	detachedFieldIndex: DetachedFieldIndex,
	visitor: DeltaVisitor,
	refreshers: NestedMap<Major, Minor, ITreeCursorSynchronous>,
	revision?: RevisionTag,
): void {
	type AtomizedNodeRename = Omit<Delta.DetachedNodeRename, "count">;
	let nextBatch = rootTransfers.flatMap(({ oldId, newId, count }) => {
		const atomized: AtomizedNodeRename[] = [];
		// It's possible for a detached node to be revived transiently such that it ends up back in the same detached field.
		// Making such a transfer wouldn't just be inefficient, it would lead us to mistakenly think we have moved all content
		// out of the source detached field, and would lead us to delete the tree index entry for that source detached field.
		// This would effectively result in the tree index missing an entry for the detached field.
		// This if statement prevents that from happening.
		if (!areDetachedNodeIdsEqual(oldId, newId)) {
			for (let i = 0; i < count; i += 1) {
				atomized.push({ oldId: offsetDetachId(oldId, i), newId: offsetDetachId(newId, i) });
			}
		}
		return atomized;
	});
	while (nextBatch.length > 0) {
		const delayed: AtomizedNodeRename[] = [];
		const priorSize = nextBatch.length;
		for (const { oldId, newId } of nextBatch) {
			let oldRootId = detachedFieldIndex.tryGetEntry(oldId);
			if (oldRootId === undefined) {
				const tree = tryGetFromNestedMap(refreshers, oldId.major, oldId.minor);
				if (tree !== undefined) {
					buildTrees(oldId, [tree], detachedFieldIndex, revision, visitor);
					oldRootId = detachedFieldIndex.getEntry(oldId);
				}
			}
			if (oldRootId === undefined) {
				// The source field is not populated.
				// This can happen when another rename needs to be performed first.
				delayed.push({ oldId, newId });
				continue;
			}
			let newRootId = detachedFieldIndex.tryGetEntry(newId);
			if (newRootId !== undefined) {
				// The destination field is already occupied.
				// This can happen when another rename needs to be performed first.
				delayed.push({ oldId, newId });
				continue;
			}
			newRootId = detachedFieldIndex.createEntry(newId, revision);
			const fields = mapToUpdate.get(oldRootId);
			if (fields !== undefined) {
				mapToUpdate.delete(oldRootId);
				mapToUpdate.set(newRootId, fields);
			}
			const oldField = detachedFieldIndex.toFieldKey(oldRootId);
			const newField = detachedFieldIndex.toFieldKey(newRootId);
			visitor.enterField(oldField);
			visitor.detach({ start: 0, end: 1 }, newField, newId);
			visitor.exitField(oldField);
			detachedFieldIndex.deleteEntry(oldId);
		}
		assert(delayed.length < priorSize, 0x7cf /* transferRoots should make progress */);
		nextBatch = delayed;
	}
}

/**
 * Visitor for changes in a delta.
 * Must be freed after use.
 */
export interface DeltaVisitor {
	/**
	 * Frees/releases the visitor.
	 *
	 * Must be called once the visitor finished traversing the delta for a couple of reasons:
	 *
	 * 1. Some visitors, such as those from forests, are put into a special mode while they have a visitor, forbidding some actions (like making more visitors).
	 *
	 * 2. Some visitors, such as those from an anchorSet, defer some events for batching purposes until the visitor is freed.
	 */
	free(): void;
	/**
	 * Creates nodes for the given content in a new detached field.
	 * @param content - The content to create.
	 * @param destination - The key for a new detached field.
	 * A field with this key must not already exist.
	 */
	create(
		content: ProtoNodes,
		destination: FieldKey,
		detachedNodeId: Delta.DetachedNodeId,
	): void;
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
	attach(
		source: FieldKey,
		sourceDetachedNodeId: Delta.DetachedNodeId,
		count: number,
		destination: PlaceIndex,
	): void;
	/**
	 * Transfers a range of nodes from the current field to a new detached field.
	 * @param source - The bounds of the range of nodes to detach.
	 * @param destination - The key for a new detached field.
	 * A field with this key must not already exist.
	 */
	detach(
		source: Range,
		destination: FieldKey,
		destinationDetachedNodeId: Delta.DetachedNodeId,
	): void;
	/**
	 * Replaces a range of nodes in the current field by transferring them out to a new detached field
	 * and transferring in all the nodes from an existing detached field in their place.
	 * The number of nodes being detached must match the number of nodes being attached.
	 * @param newContentSource - The detached field to transfer the new nodes from.
	 * @param range - The bounds of the range of nodes to replace.
	 * @param oldContentDestination - The key for a new detached field to transfer the old nodes to.
	 */
	replace(
		newContentSource: FieldKey,
		sourceDetachedNodeId: Delta.DetachedNodeId,
		range: Range,
		oldContentDestination: FieldKey,
		destinationDetachedNodeId: Delta.DetachedNodeId,
	): void;

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

	/**
	 * The latest revision tag associated with the given delta. This is used to keep track
	 * of when repair data should be garbage collected.
	 */
	readonly latestRevision: RevisionTag | undefined;

	readonly detachedFieldIndex: DetachedFieldIndex;
	/**
	 * A mapping between forest root id and trees that represent refresher data. Each entry is only
	 * created in the forest once needed.
	 */
	readonly refreshers: NestedMap<Major, Minor, ITreeCursorSynchronous>;
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
	readonly rootTransfers: Delta.DetachedNodeRename[];
	/**
	 * Represents roots that need to be destroyed.
	 * Collected as part of the detach pass.
	 * Carried out at the end of the attach pass.
	 */
	readonly rootDestructions: Delta.DetachedNodeDestruction[];
}

type Pass = (delta: Delta.FieldChanges, visitor: DeltaVisitor, config: PassConfig) => void;

function visitFieldMarks(
	fields: Delta.FieldMap | undefined,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	if (fields !== undefined) {
		for (const [key, field] of fields) {
			visitor.enterField(key);
			config.func(field, visitor, config);
			visitor.exitField(key);
		}
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
function detachPass(
	fieldChanges: Delta.FieldChanges,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	let index = 0;
	for (const mark of fieldChanges) {
		if (mark.fields !== undefined) {
			assert(
				mark.attach === undefined || mark.detach !== undefined,
				0x7d0 /* Invalid nested changes on an additive mark */,
			);
			visitNode(index, mark.fields, visitor, config);
		}
		if (isDetachMark(mark)) {
			for (let i = 0; i < mark.count; i += 1) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const id = offsetDetachId(mark.detach!, i);
				const root = config.detachedFieldIndex.createEntry(id, config.latestRevision);
				if (mark.fields !== undefined) {
					config.attachPassRoots.set(root, mark.fields);
				}
				const field = config.detachedFieldIndex.toFieldKey(root);
				visitor.detach({ start: index, end: index + 1 }, field, id);
			}
		} else if (!isAttachMark(mark)) {
			index += mark.count;
		}
	}
}

function buildTrees(
	id: Delta.DetachedNodeId,
	trees: readonly ITreeCursorSynchronous[],
	detachedFieldIndex: DetachedFieldIndex,
	latestRevision: RevisionTag | undefined,
	visitor: DeltaVisitor,
): void {
	for (const [i, tree] of trees.entries()) {
		const offsettedId = offsetDetachId(id, i);
		let root = detachedFieldIndex.tryGetEntry(offsettedId);
		assert(root === undefined, 0x929 /* Unable to build tree that already exists */);
		root = detachedFieldIndex.createEntry(offsettedId, latestRevision);
		const field = detachedFieldIndex.toFieldKey(root);
		visitor.create([tree], field, offsettedId);
	}
}

function processBuilds(
	builds: readonly Delta.DetachedNodeBuild[] | undefined,
	config: PassConfig,
	visitor: DeltaVisitor,
): void {
	if (builds !== undefined) {
		for (const { id, trees } of builds) {
			buildTrees(id, trees, config.detachedFieldIndex, config.latestRevision, visitor);
		}
	}
}

function processGlobal(
	global: readonly Delta.DetachedNodeChanges[] | undefined,
	config: PassConfig,
	visitor: DeltaVisitor,
): void {
	if (global !== undefined) {
		for (const { id, fields } of global) {
			let root = config.detachedFieldIndex.tryGetEntry(id);
			if (root === undefined) {
				const tree = tryGetFromNestedMap(config.refreshers, id.major, id.minor);
				assert(tree !== undefined, 0x928 /* refresher data not found */);
				buildTrees(id, [tree], config.detachedFieldIndex, config.latestRevision, visitor);
				root = config.detachedFieldIndex.getEntry(id);
			}
			// the revision is updated for any refresher data included in the delta that is used
			config.detachedFieldIndex.updateLatestRevision(id, config.latestRevision);
			config.detachPassRoots.set(root, fields);
			config.attachPassRoots.set(root, fields);
		}
	}
}

function processRename(
	rename: readonly Delta.DetachedNodeRename[] | undefined,
	config: PassConfig,
): void {
	if (rename !== undefined) {
		config.rootTransfers.push(...rename);
	}
}

function collectDestroys(
	destroys: readonly Delta.DetachedNodeDestruction[] | undefined,
	config: PassConfig,
): void {
	if (destroys !== undefined) {
		config.rootDestructions.push(...destroys);
	}
}

/**
 * Preforms the following:
 * - Executes attaches (top-down) applying nested changes on the attached nodes
 * - Executes replaces (top-down) applying nested changes on the attached nodes
 * - Collects detached roots (from replaces) that need an attach pass
 */
function attachPass(
	fieldChanges: Delta.FieldChanges,
	visitor: DeltaVisitor,
	config: PassConfig,
): void {
	let index = 0;
	for (const mark of fieldChanges) {
		if (isAttachMark(mark) || isReplaceMark(mark)) {
			for (let i = 0; i < mark.count; i += 1) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const offsetAttachId = offsetDetachId(mark.attach!, i);
				let sourceRoot = config.detachedFieldIndex.tryGetEntry(offsetAttachId);
				if (sourceRoot === undefined) {
					const tree = tryGetFromNestedMap(
						config.refreshers,
						offsetAttachId.major,
						offsetAttachId.minor,
					);
					assert(tree !== undefined, 0x92a /* refresher data not found */);
					buildTrees(
						offsetAttachId,
						[tree],
						config.detachedFieldIndex,
						config.latestRevision,
						visitor,
					);
					sourceRoot = config.detachedFieldIndex.getEntry(offsetAttachId);
				}
				const sourceField = config.detachedFieldIndex.toFieldKey(sourceRoot);
				const offsetIndex = index + i;
				if (isReplaceMark(mark)) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const destinationId = offsetDetachId(mark.detach!, i);
					const rootDestination = config.detachedFieldIndex.createEntry(
						destinationId,
						config.latestRevision,
					);
					const destinationField = config.detachedFieldIndex.toFieldKey(rootDestination);
					visitor.replace(
						sourceField,
						offsetAttachId,
						{ start: offsetIndex, end: offsetIndex + 1 },
						destinationField,
						destinationId,
					);
					// We may need to do a second pass on the detached nodes
					if (mark.fields !== undefined) {
						config.attachPassRoots.set(rootDestination, mark.fields);
					}
				} else {
					// This a simple attach
					visitor.attach(sourceField, offsetAttachId, 1, offsetIndex);
				}
				config.detachedFieldIndex.deleteEntry(offsetAttachId);
				const fields = config.attachPassRoots.get(sourceRoot);
				if (fields !== undefined) {
					config.attachPassRoots.delete(sourceRoot);
					visitNode(offsetIndex, fields, visitor, config);
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
