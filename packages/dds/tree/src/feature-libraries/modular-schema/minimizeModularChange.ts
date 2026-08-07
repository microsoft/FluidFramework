/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
import {
	EditFilterStatus,
	NodeAttachState,
	type FilterAttachResult,
} from "./fieldChangeHandler.js";

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
 * @param changeFamily - The change family used to compute the change's delta and identify built nodes.
 */
export function minimizeModularChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	forestFactory: () => IEditableForest,
): ModularChangeset {
	const { builtRootIds, builtNodeIds, rootIdToNodeId } = getNodeInfo(change, fieldKinds);
	const delta = intoDelta(makeAnonChange(change), fieldKinds);
	const attachedRootIds = collectAttachedRootIds(delta, indexGlobalById(delta));
	const outputToInputRootId = outputToInputRootIdFromDelta(delta);
	const outputAttachStates = getOutputNodeAttachStates(change, fieldKinds);

	function isNodeIdInBuiltTree(nodeId: NodeId | undefined): boolean {
		return (
			nodeId !== undefined &&
			getFromChangeAtomIdMap(builtNodeIds, normalizeNodeId(nodeId, change.nodeAliases)) ===
				true
		);
	}

	function isNodeDetachedInOutput(nodeId: NodeId): boolean {
		return (
			(getFromChangeAtomIdMap(
				outputAttachStates,
				normalizeNodeId(nodeId, change.nodeAliases),
			) ?? fail("Should have attach state for every node ID")) === NodeAttachState.Detached
		);
	}

	function isFieldDetachedInOutput(fieldId: FieldId): boolean {
		return fieldId.nodeId !== undefined && isNodeDetachedInOutput(fieldId.nodeId);
	}

	function shouldSquashDetach(fieldId: FieldId): boolean {
		return isNodeIdInBuiltTree(fieldId.nodeId);
	}

	function shouldSquashAttach(
		fieldId: FieldId,
		rootInputId: ChangeAtomId,
		count: number,
		endpoint: FieldId | undefined,
	): RangeQueryResult<boolean> {
		if (!isNodeIdInBuiltTree(fieldId.nodeId)) {
			return { value: false, length: count };
		}

		let countProcessed = count;
		const isMoveOfBuiltRootEntry = builtRootIds.getFirst(rootInputId, countProcessed);
		countProcessed = isMoveOfBuiltRootEntry.length;

		const isAttachOfBuiltRoot = isMoveOfBuiltRootEntry?.value ?? false;
		const isMoveFromBuiltTree =
			endpoint?.nodeId !== undefined && isNodeIdInBuiltTree(endpoint.nodeId);

		const isAttachOfBuiltNode = isAttachOfBuiltRoot || isMoveFromBuiltTree;
		return { value: isAttachOfBuiltNode, length: countProcessed };
	}

	function shouldDropAttach(
		fieldId: FieldId,
		rootInputId: ChangeAtomId,
		count: number,
		endpoint: FieldId | undefined,
		isTransientAttach: boolean,
	): RangeQueryResult<boolean> {
		const isInDetachedTree = isFieldDetachedInOutput(fieldId);

		let countProcessed = count;
		const isBuiltRootEntry = builtRootIds.getFirst(rootInputId, countProcessed);
		countProcessed = isBuiltRootEntry.length;

		const isTransientAttachOfRoot = isTransientAttach && isBuiltRootEntry.value === true;
		const shouldSquashAttachEntry = shouldSquashAttach(
			fieldId,
			rootInputId,
			countProcessed,
			endpoint,
		);
		countProcessed = shouldSquashAttachEntry.length;
		return {
			value: isInDetachedTree || shouldSquashAttachEntry.value || isTransientAttachOfRoot,
			length: countProcessed,
		};
	}

	function shouldDropDetach(
		fieldId: FieldId,
		rootInputId: ChangeAtomId | undefined,
		count: number,
		endpoint: FieldId | undefined,
	): RangeQueryResult<boolean> {
		const isInDetachedTree = isFieldDetachedInOutput(fieldId);
		const isMoveToAttachedTree = endpoint !== undefined && !isFieldDetachedInOutput(endpoint);
		if (shouldSquashDetach(fieldId) || (isInDetachedTree && !isMoveToAttachedTree)) {
			return { value: true, length: count };
		}

		if (rootInputId !== undefined) {
			// `inputRootId` is defined when this detach represents the rename of a detached root.
			const isDetachOfBuiltRootEntry = builtRootIds.getFirst(rootInputId, count);
			const isDetachOfBuiltRoot = isDetachOfBuiltRootEntry.value !== undefined;

			// If this is a rename of a built node, either it ends detached, or is moved elsewhere.
			// If moved, we squash the detach away, leaving only an attach at the destination.
			// If detached, the build is not used, so we drop the rename.
			return {
				value: isDetachOfBuiltRoot,
				length: isDetachOfBuiltRootEntry.length,
			};
		}

		return { value: false, length: count };
	}

	const filterEditsForBuildChange = (
		fieldChange: FieldChange,
		fieldId: FieldId,
	): FieldChange => {
		const filterDetach = (
			detachId: ChangeAtomId,
			count: number,
			inputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			if (!shouldSquashDetach(fieldId)) {
				return { value: EditFilterStatus.Remove, length: count };
			}

			let countProcessed = count;
			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...(endpoint ?? detachId), target: CrossFieldTarget.Destination },
				countProcessed,
			);
			countProcessed = moveEndpointEntry.length;

			if (moveEndpointEntry.value !== undefined) {
				const willSquashEndpointEntry = shouldSquashAttach(
					moveEndpointEntry.value,
					inputRootId ?? detachId,
					countProcessed,
					fieldId,
				);
				countProcessed = willSquashEndpointEntry.length;

				const action = willSquashEndpointEntry.value
					? EditFilterStatus.Preserve
					: EditFilterStatus.PreserveWithoutMove;

				return { value: action, length: moveEndpointEntry.length };
			}

			return { value: EditFilterStatus.Preserve, length: moveEndpointEntry.length };
		};

		const filterAttach = (
			id: ChangeAtomId,
			count: number,
			_onputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<FilterAttachResult> => {
			let countProcessed = count;
			const moveId = endpoint ?? id;
			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...moveId, target: CrossFieldTarget.Source },
				countProcessed,
			);
			countProcessed = moveEndpointEntry.length;

			const inputIdEntry = outputToInputRootId.getFirst(moveId, countProcessed);
			countProcessed = inputIdEntry.length;

			const rootInputId = inputIdEntry.value ?? moveId;
			const shouldSquashEntry = shouldSquashAttach(
				fieldId,
				rootInputId,
				countProcessed,
				moveEndpointEntry.value,
			);
			countProcessed = shouldSquashEntry.length;

			const isMove = moveEndpointEntry.value !== undefined;
			if (!shouldSquashEntry.value) {
				return { value: { action: EditFilterStatus.Remove }, length: countProcessed };
			}

			if (isMove) {
				const movedNodeId = getFromChangeAtomIdMap(rootIdToNodeId, moveId);
				return {
					value: {
						action: EditFilterStatus.PreserveWithoutMove,
						nodeId: movedNodeId,
						newAttachId: rootInputId,
					},
					length: countProcessed,
				};
			}

			const action = shouldSquashEntry.value
				? EditFilterStatus.Preserve
				: EditFilterStatus.Remove;

			return {
				value: { action },
				length: countProcessed,
			};
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
	const detachedFieldIndex = makeDetachedFieldIndex();

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
		fieldId: FieldId,
	): FieldChange => {
		const filterDetach = (
			detachId: ChangeAtomId,
			count: number,
			inputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			let countProcessed = count;
			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...(endpoint ?? detachId), target: CrossFieldTarget.Destination },
				count,
			);
			countProcessed = moveEndpointEntry.length;

			const shouldDropEntry = shouldDropDetach(
				fieldId,
				inputRootId,
				countProcessed,
				moveEndpointEntry.value,
			);
			countProcessed = shouldDropEntry.length;

			if (shouldDropEntry.value) {
				return {
					value: EditFilterStatus.Remove,
					length: countProcessed,
				};
			}

			if (moveEndpointEntry.value !== undefined) {
				// KLUDGE: We can't easily determine whether the nodes are transiently attached,
				// but it is safe to pass `false`, because the flag is only used for built nodes,
				// and we already drop detaches for built nodes.
				const willDropAttachEntry = shouldDropAttach(
					moveEndpointEntry.value,
					inputRootId ?? detachId,
					countProcessed,
					fieldId,
					false, // isTransientAttach
				);
				countProcessed = willDropAttachEntry.length;
				if (willDropAttachEntry.value) {
					return {
						value: EditFilterStatus.PreserveWithoutMove,
						length: countProcessed,
					};
				}
			}

			return {
				value: EditFilterStatus.Preserve,
				length: countProcessed,
			};
		};

		const filterAttach = (
			id: ChangeAtomId,
			count: number,
			outputRootId: ChangeAtomId | undefined,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<FilterAttachResult> => {
			let countProcessed = count;
			const moveId = endpoint ?? id;
			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...moveId, target: CrossFieldTarget.Source },
				countProcessed,
			);
			countProcessed = moveEndpointEntry.length;

			const inputIdEntry = outputToInputRootId.getFirst(moveId, countProcessed);
			countProcessed = inputIdEntry.length;

			const rootInputId = inputIdEntry.value ?? moveId;
			const shouldDropEntry = shouldDropAttach(
				fieldId,
				rootInputId,
				countProcessed,
				moveEndpointEntry.value,
				outputRootId !== undefined,
			);
			countProcessed = shouldDropEntry.length;

			if (shouldDropEntry.value) {
				return {
					value: { action: EditFilterStatus.Remove },
					length: countProcessed,
				};
			}

			if (moveEndpointEntry.value !== undefined) {
				const willDropEndpointEntry = shouldDropDetach(
					moveEndpointEntry.value,
					inputIdEntry.value,
					countProcessed,
					fieldId,
				);
				countProcessed = willDropEndpointEntry.length;
				if (willDropEndpointEntry.value) {
					const movedNodeId = getFromChangeAtomIdMap(rootIdToNodeId, moveId);
					return {
						value: {
							action: EditFilterStatus.PreserveWithoutMove,
							nodeId: movedNodeId,
							newAttachId: inputIdEntry.value,
						},
						length: countProcessed,
					};
				}
			}

			return {
				value: { action: EditFilterStatus.Preserve },
				length: countProcessed,
			};
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
