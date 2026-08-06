/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	makeAnonChange,
	makeChangeAtomId,
	makeDetachedFieldIndex,
	newChangeAtomIdRangeMap,
	newChangeAtomIdTransform,
	offsetChangeAtomId,
	visitDelta,
	type ChangeAtomId,
	type ChangeAtomIdMap,
	type ChangeAtomIdRangeMap,
	type DeltaFieldMap,
	type DeltaRoot,
	type FieldKindIdentifier,
	type IEditableForest,
	type RevisionTagCodec,
	type TreeChunk,
} from "../../core/index.js";
import {
	brand,
	setInNestedMap,
	type Mutable,
	type RangeQueryResult,
} from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import { CrossFieldTarget } from "./crossFieldQueries.js";
import { EditFilterStatus, NodeAttachState } from "./fieldChangeHandler.js";

import type { FlexFieldKind } from "./fieldKind.js";
import { invertModularChange } from "./invert.js";
import { intoDelta } from "./modularChangeFamily.js";
import type {
	FieldChange,
	FieldChangeMap,
	FieldId,
	ModularChangeset,
	NodeChangeset,
	NodeId,
} from "./modularChangeTypes.js";
import {
	filterEdits,
	getChangeHandler,
	nodeChangeFromId,
	normalizeNodeId,
} from "./modularChangeUtils.js";
import { assert, fail } from "@fluidframework/core-utils/internal";
import { pruneFieldMap } from "./prune.js";

/**
 * "Minimizes" a {@link ModularChangeset} so that it contains no extraneous
 * information, i.e. no new content that isn't observable from document tree
 * and no edits without net observed effect on the document tree.
 * @remarks
 * "Extraneous information" includes, for example, data for nodes that were both created and removed within the same
 * transaction, or changes whose effects cancel out to nothing. Minimizing reduces the size of an edit without altering
 * its observable effect.
 *
 * This is the eventual home of the minimization algorithm, colocated with {@link ModularChangeFamily} so it can use its
 * internals. It is currently a no-op that returns the change unchanged; a real implementation will be provided in a
 * future change.
 *
 * @param change - The change to minimize.
 * @param fieldKinds - The field kinds to delegate to when computing the change's delta.
 */
export function minimizeModularChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	forestFactory: () => IEditableForest,
): ModularChangeset {
	const { builtRootIds, builtNodeIds } = getNodeInfo(change, fieldKinds);
	const delta = intoDelta(makeAnonChange(change), fieldKinds);
	const attachedRootIds = collectAttachedRootIds(delta, indexGlobalById(delta));
	const outputToInputRootId = outputToInputRootIdFromDelta(delta);
	const outputAttachStates = getOutputNodeAttachStates(change, fieldKinds);

	function isNodeAttachedInOutput(nodeId: NodeId | undefined): boolean {
		return (
			nodeId === undefined ||
			(getFromChangeAtomIdMap(outputAttachStates, nodeId) ??
				fail("Should have attach state for every node ID")) === NodeAttachState.Attached
		);
	}

	function isNodeIdInBuiltTree(nodeId: NodeId | undefined): boolean {
		return (
			nodeId !== undefined &&
			getFromChangeAtomIdMap(builtNodeIds, normalizeNodeId(nodeId, change.nodeAliases)) ===
				true
		);
	}

	function isFieldIdInBuiltTree(fieldId: FieldId): boolean {
		return isNodeIdInBuiltTree(fieldId.nodeId);
	}

	const filterEditsForBuildChange = (
		fieldChange: FieldChange,
		nodeId: NodeId | undefined,
	): FieldChange => {
		const filterDetach = (
			id: ChangeAtomId,
			count: number,
			inputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			if (!isNodeIdInBuiltTree(nodeId)) {
				return { value: EditFilterStatus.Remove, length: count };
			}

			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...(endpoint ?? id), target: CrossFieldTarget.Destination },
				count,
			);

			const isMoveToExistingTree =
				moveEndpointEntry.value !== undefined &&
				!isFieldIdInBuiltTree(moveEndpointEntry.value);

			// If the original change moves from a newly built node to an existing tree,
			// we apply only the detach part of the move to the built tree.
			const result = isMoveToExistingTree
				? EditFilterStatus.PreserveWithoutMove
				: EditFilterStatus.Preserve;

			return { value: result, length: moveEndpointEntry.length };
		};

		const filterAttach = (
			id: ChangeAtomId,
			count: number,
			inputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			if (!isNodeIdInBuiltTree(nodeId)) {
				return { value: EditFilterStatus.Remove, length: count };
			}

			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...(endpoint ?? id), target: CrossFieldTarget.Source },
				count,
			);

			const isMoveFromExistingTree =
				moveEndpointEntry.value !== undefined &&
				!isFieldIdInBuiltTree(moveEndpointEntry.value);

			const result = isMoveFromExistingTree
				? EditFilterStatus.Remove
				: EditFilterStatus.Preserve;

			return { value: result, length: moveEndpointEntry.length };
		};

		return {
			...fieldChange,
			change: brand(
				getChangeHandler(fieldKinds, fieldChange.fieldKind).rebaser.filterEdits(
					fieldChange.change,
					{
						filterDetach,
						filterAttach,
						preserveOtherEdits: false,
					},
				),
			),
		};
	};

	const changeForBuilds = filterEdits(change, filterEditsForBuildChange);
	const deltaForBuilds = intoDelta(makeAnonChange(changeForBuilds), fieldKinds);
	const forest = forestFactory();
	const detachedFieldIndex = makeDetachedFieldIndex(
		undefined,
		undefined as unknown as RevisionTagCodec,
		undefined as unknown as IIdCompressor,
	);

	visitDelta(deltaForBuilds, forest.acquireVisitor(), detachedFieldIndex, undefined);
	const squashedBuilds = newChangeAtomIdBTree<TreeChunk>();
	const cursor = forest.getCursorAboveDetachedFields();
	for (const entry of detachedFieldIndex.entries()) {
		cursor.enterField(detachedFieldIndex.toFieldKey(entry.root));
		const chunks = forest.chunkField(cursor);
		assert(chunks.length === 1, "XXX: Handle multiple chunks");
		const chunk = chunks[0] ?? fail("Expected at least one chunk");
		assert(chunk.topLevelLength === 1, "XXX: Handle chunk with range of nodes");

		const rootId: ChangeAtomId = {
			revision: entry.id.major,
			localId: brand(entry.id.minor),
		};

		const isAttachedEntry = attachedRootIds.getFirst(rootId, chunk.topLevelLength);
		assert(
			isAttachedEntry.length === chunk.topLevelLength,
			"TODO: Handle chunks which are only partially attached",
		);

		if (isAttachedEntry.value) {
			setInChangeAtomIdMap(squashedBuilds, rootId, chunk);
		}

		cursor.exitField();
	}

	const filterEditsForResidualChange = (
		fieldChange: FieldChange,
		nodeId: NodeId | undefined,
	): FieldChange => {
		const filterDetach = (
			id: ChangeAtomId,
			count: number,
			inputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			// If `inputId` is defined, this represents the rename of a detached root.
			// If that detached root is newly built, then we should remove it from the residual change.
			const isDetachOfBuiltRootEntry =
				inputRootId === undefined ? undefined : builtRootIds.getFirst(inputRootId, count);

			const isDetachOfBuiltNode =
				isDetachOfBuiltRootEntry?.value ?? isNodeIdInBuiltTree(nodeId);

			const shouldRemove = isDetachOfBuiltNode || !isNodeAttachedInOutput(nodeId);
			return {
				value: shouldRemove ? EditFilterStatus.Remove : EditFilterStatus.Preserve,
				length: isDetachOfBuiltRootEntry?.length ?? count,
			};
		};

		const filterAttach = (
			id: ChangeAtomId,
			count: number,
			outputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			let countProcessed = count;
			if (!isNodeAttachedInOutput(nodeId)) {
				return { value: EditFilterStatus.Remove, length: countProcessed };
			}

			const moveId = endpoint ?? id;

			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...moveId, target: CrossFieldTarget.Source },
				countProcessed,
			);
			countProcessed = moveEndpointEntry.length;

			const inputIdEntry = outputToInputRootId.getFirst(moveId, countProcessed);
			countProcessed = inputIdEntry.length;

			const inputId = inputIdEntry.value ?? moveId;
			const isMoveOfBuiltRootEntry = builtRootIds.getFirst(inputId, countProcessed);
			countProcessed = isMoveOfBuiltRootEntry.length;

			const isMoveOfBuiltRoot = isMoveOfBuiltRootEntry?.value ?? false;
			const isMoveFromBuiltTree =
				moveEndpointEntry.value !== undefined && isFieldIdInBuiltTree(moveEndpointEntry.value);

			const isMoveOfBuiltNode = isMoveOfBuiltRoot || isMoveFromBuiltTree;

			if (outputRootId !== undefined && isMoveOfBuiltNode) {
				// The built node is only transiently attached.
				return { value: EditFilterStatus.Remove, length: countProcessed };
			}

			if (nodeId !== undefined && isNodeIdInBuiltTree(nodeId)) {
				const outputAttachState =
					getFromChangeAtomIdMap(outputAttachStates, nodeId) ??
					fail("Should have attach state for every node ID");

				if (outputAttachState === NodeAttachState.Detached) {
					// Edits to unused builds should be removed.
					return { value: EditFilterStatus.Remove, length: countProcessed };
				}

				const isMoveFromExistingTree =
					moveEndpointEntry.value !== undefined && !isMoveFromBuiltTree;

				// Moves of existing content could not be squashed into the build,
				// so they must remain in the residual change.
				return {
					value:
						isMoveFromExistingTree && !isMoveOfBuiltRoot
							? EditFilterStatus.Preserve
							: EditFilterStatus.Remove,
					length: countProcessed,
				};
			}

			// The detach of the moved node will have already been squashed into the builds,
			// so we only need to preserve the attach.
			const result = isMoveFromBuiltTree
				? EditFilterStatus.PreserveWithoutMove
				: EditFilterStatus.Preserve;

			return { value: result, length: countProcessed };
		};

		return {
			...fieldChange,
			change: brand(
				getChangeHandler(fieldKinds, fieldChange.fieldKind).rebaser.filterEdits(
					fieldChange.change,
					{
						filterDetach,
						filterAttach,
						preserveOtherEdits: false,
					},
				),
			),
		};
	};

	const residualChange = filterEdits(change, filterEditsForResidualChange);
	(residualChange as Mutable<ModularChangeset>).builds = squashedBuilds;
	const prunedFields = pruneFieldMap(
		residualChange.fieldChanges,
		residualChange.nodeChanges,
		fieldKinds,
	);

	(residualChange as Mutable<ModularChangeset>).fieldChanges = prunedFields ?? new Map();
	return residualChange;
}

function getOutputNodeAttachStates(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ChangeAtomIdBTree<NodeAttachState> {
	const inverse = invertModularChange(makeAnonChange(change), true, "root", fieldKinds);
	return getInputNodeAttachStates(inverse, fieldKinds);
}

function getInputNodeAttachStates(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ChangeAtomIdBTree<NodeAttachState> {
	const nodeAttachStates = newChangeAtomIdBTree<NodeAttachState>();
	addInputNodeAttachStatesForFields(
		NodeAttachState.Attached,
		change.fieldChanges,
		change.nodeChanges,
		change.nodeAliases,
		fieldKinds,
		nodeAttachStates,
	);
	return nodeAttachStates;
}

function addInputNodeAttachStatesForFields(
	parentState: NodeAttachState,
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	nodeAttachStates: ChangeAtomIdBTree<NodeAttachState>,
): void {
	for (const fieldChange of fields.values()) {
		const children = getChangeHandler(fieldKinds, fieldChange.fieldKind).getNestedChanges(
			fieldChange.change,
		);

		for (const [nodeId, inputId, _outputId] of children) {
			const normalizedNodeId = normalizeNodeId(nodeId, nodeAliases);
			const attachState =
				parentState === NodeAttachState.Attached && inputId === undefined
					? NodeAttachState.Attached
					: NodeAttachState.Detached;

			nodeAttachStates.set([normalizedNodeId.revision, normalizedNodeId.localId], attachState);

			const nodeChangeset = nodeChangeFromId(nodes, normalizedNodeId);
			if (nodeChangeset.fieldChanges !== undefined) {
				addInputNodeAttachStatesForFields(
					attachState,
					nodeChangeset.fieldChanges,
					nodes,
					nodeAliases,
					fieldKinds,
					nodeAttachStates,
				);
			}
		}
	}
}

function getNodeInfo(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): {
	builtRootIds: ChangeAtomIdRangeMap<true>;
	builtNodeIds: ChangeAtomIdBTree<true>;
	/**
	 * Maps from the input context ID for roots which are already detached,
	 * or detach ID for roots which are detached or moved by `change`.
	 */
	rootIdToNodeId: ChangeAtomIdBTree<NodeId>;
} {
	const builtRootIds = newChangeAtomIdRangeMap<true>();
	if (change.builds !== undefined) {
		for (const [rootId, chunk] of change.builds.entries()) {
			builtRootIds.set(makeChangeAtomId(rootId[1], rootId[0]), chunk.topLevelLength, true);
		}
	}

	const builtNodeIds = newChangeAtomIdBTree<true>();
	const rootIdToNodeId = newChangeAtomIdBTree<NodeId>();
	addNodeInfoForFields(
		false,
		change.fieldChanges,
		change.nodeChanges,
		change.nodeAliases,
		builtRootIds,
		fieldKinds,
		builtNodeIds,
		rootIdToNodeId,
	);

	return { builtRootIds, builtNodeIds, rootIdToNodeId };
}

function addNodeInfoForFields(
	parentIsBuilt: boolean,
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	buildIds: ChangeAtomIdRangeMap<true>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	builtNodeIds: ChangeAtomIdBTree<true>,
	rootIdToNodeId: ChangeAtomIdBTree<NodeId>,
): void {
	for (const fieldChange of fields.values()) {
		const children = getChangeHandler(fieldKinds, fieldChange.fieldKind).getNestedChanges(
			fieldChange.change,
		);

		for (const [nodeId, inputId, detachId] of children) {
			const normalizedNodeId = normalizeNodeId(nodeId, nodeAliases);
			const isPartOfBuild =
				parentIsBuilt ||
				(inputId !== undefined && buildIds.getFirst(inputId, 1).value === true);

			if (isPartOfBuild) {
				builtNodeIds.set([normalizedNodeId.revision, normalizedNodeId.localId], true);
			}

			if (inputId !== undefined) {
				setInChangeAtomIdMap(rootIdToNodeId, inputId, normalizedNodeId);
			}

			if (detachId !== undefined) {
				setInChangeAtomIdMap(rootIdToNodeId, detachId, normalizedNodeId);
			}

			const nodeChangeset = nodeChangeFromId(nodes, normalizedNodeId);
			if (nodeChangeset.fieldChanges !== undefined) {
				addNodeInfoForFields(
					isPartOfBuild,
					nodeChangeset.fieldChanges,
					nodes,
					nodeAliases,
					buildIds,
					fieldKinds,
					builtNodeIds,
					rootIdToNodeId,
				);
			}
		}
	}
}

/** A contiguous run of node IDs starting at `id` and spanning `count` consecutive IDs. */
interface ChangeAtomIdRange {
	readonly id: ChangeAtomId;
	readonly count: number;
}

/**
 * A set of node IDs, stored as a {@link ChangeAtomIdRangeMap} so that consecutive runs of IDs are
 * represented (and marked/queried) as ranges rather than one entry per ID.
 */
type ChangeAtomIdRangeSet = ChangeAtomIdRangeMap<true>;

/**
 * Collects the set of node IDs whose content ends up attached within the live document tree
 * once the given change is applied.
 *
 * @remarks
 * These are the "used" nodes: any build whose nodes are not in this set has no observable
 * effect on the resulting document and can be dropped.
 */
function collectAttachedRootIds(
	delta: DeltaRoot,
	globalById: ChangeAtomIdMap<DeltaFieldMap>,
): ChangeAtomIdRangeSet {
	const attached: ChangeAtomIdRangeSet = newChangeAtomIdRangeMap<true>();
	// Worklist of detached node ID ranges newly discovered to be live, whose own nested content must be visited.
	const worklist: ChangeAtomIdRange[] = [];
	const markLive = (id: ChangeAtomId, count: number): void => {
		// Only the sub-ranges of `[id, id + count)` that are not already live are newly discovered.
		// Mark each such run live in a single range operation and enqueue it for processing.
		for (const fragment of attached.getAll(id, count)) {
			if (fragment.value === undefined) {
				const runStart = offsetChangeAtomId(id, fragment.offset);
				attached.set(runStart, fragment.length, true);
				worklist.push({ id: runStart, count: fragment.length });
			}
		}
	};

	const visitLiveFields = (fields: DeltaFieldMap | undefined): void => {
		if (fields === undefined) {
			return;
		}
		for (const field of fields.values()) {
			for (const mark of field.marks) {
				if (mark.attach !== undefined) {
					markLive(
						{ revision: mark.attach.major, localId: brand(mark.attach.minor) },
						mark.count,
					);
				}
				// `mark.fields` edits the cell's pre-existing content. Only descend when that content
				// stays in the live tree (i.e. it is not being detached out of the tree).
				if (mark.detach === undefined) {
					visitLiveFields(mark.fields);
				}
			}
		}
	};

	visitLiveFields(delta.fields);

	// Process node ranges discovered to be live: pull in their nested content (from `global`) and propagate
	// liveness backwards across renames (a node attached under its post-rename ID was built under its
	// pre-rename ID). Iterate to a fixed point.
	while (worklist.length > 0) {
		const next = worklist.pop();
		if (next === undefined) {
			break;
		}
		const { id, count } = next;
		// Nested content in `global` is keyed per node, so it must be visited one ID at a time.
		for (let offset = 0; offset < count; offset += 1) {
			visitLiveFields(globalById.get(id.revision)?.get(brand(id.localId + offset)));
		}
		if (delta.rename !== undefined) {
			for (const { oldId, newId, count: renameCount } of delta.rename) {
				if (newId.major !== id.revision) {
					continue;
				}
				// Overlap of the live range `[id.localId, id.localId + count)` with this rename's
				// post-rename range `[newId.minor, newId.minor + renameCount)`.
				const overlapStart = Math.max(id.localId, newId.minor);
				const overlapEnd = Math.min(id.localId + count, newId.minor + renameCount);
				if (overlapStart < overlapEnd) {
					markLive(
						{
							revision: oldId.major,
							localId: brand(oldId.minor + (overlapStart - newId.minor)),
						},
						overlapEnd - overlapStart,
					);
				}
			}
		}
	}

	return attached;
}

/**
 * Indexes a delta's {@link DeltaRoot.global | global} detached-node changes by their node ID.
 *
 * @remarks
 * `DeltaRoot.global` describes modifications to nodes that are built or preexist the change as
 * detached roots, keyed by node ID. This builds a `revision -> localId -> fields` lookup so
 * those per-node {@link DeltaFieldMap | field changes} can be resolved quickly (for example,
 * when trimming transient content out of a surviving node's build tree).
 */
function indexGlobalById(delta: DeltaRoot): ChangeAtomIdMap<DeltaFieldMap> {
	const globalById: ChangeAtomIdMap<DeltaFieldMap> = new Map();
	if (delta.global !== undefined) {
		for (const { id, fields } of delta.global) {
			setInNestedMap(globalById, id.major, id.minor, fields);
		}
	}
	return globalById;
}

function outputToInputRootIdFromDelta(delta: DeltaRoot): ChangeAtomIdRangeMap<ChangeAtomId> {
	const outputToInputRootId = newChangeAtomIdTransform();
	if (delta.rename !== undefined) {
		for (const { oldId, newId, count } of delta.rename) {
			outputToInputRootId.set(
				makeChangeAtomId(brand(newId.minor), newId.major),
				count,
				makeChangeAtomId(brand(oldId.minor), oldId.major),
			);
		}
	}

	return outputToInputRootId;
}
