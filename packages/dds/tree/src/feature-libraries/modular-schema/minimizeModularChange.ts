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
	return new ModularChangeMinimizer(change, fieldKinds).minimize(forestFactory);
}

class ModularChangeMinimizer {
	private readonly builtNodeIds: ChangeAtomIdBTree<true>;
	private readonly builtRootIds: ChangeAtomIdRangeMap<true>;
	private readonly outputAttachStates: ChangeAtomIdBTree<NodeAttachState>;
	private readonly outputToInputRootId: ChangeAtomIdRangeMap<ChangeAtomId>;
	private readonly rootIdToNodeId: ChangeAtomIdBTree<NodeId>;
	private readonly attachedRootIds: ChangeAtomIdRangeSet;

	public constructor(
		private readonly change: ModularChangeset,
		private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	) {
		this.outputAttachStates = getOutputNodeAttachStates(change, fieldKinds);
		const nodeInfo = getNodeInfo(change, fieldKinds);
		this.builtNodeIds = nodeInfo.builtNodeIds;
		this.builtRootIds = nodeInfo.builtRootIds;
		this.rootIdToNodeId = nodeInfo.rootIdToNodeId;

		const delta = intoDelta(makeAnonChange(change), fieldKinds);
		this.attachedRootIds = collectAttachedRootIds(delta, indexGlobalById(delta));
		this.outputToInputRootId = outputToInputRootIdFromDelta(delta);
	}

	public minimize(forestFactory: () => IEditableForest): ModularChangeset {
		const residualChange = filterEdits(
			this.change,
			this.filterEditsForResidualChange.bind(this),
		);

		(residualChange as Mutable<ModularChangeset>).builds = this.squashBuilds(forestFactory);

		const prunedFields = pruneFieldMap(
			residualChange.fieldChanges,
			residualChange.nodeChanges,
			this.fieldKinds,
		);
		(residualChange as Mutable<ModularChangeset>).fieldChanges = prunedFields ?? new Map();
		return residualChange;
	}

	private isNodeIdInBuiltTree(nodeId: NodeId | undefined): boolean {
		return (
			nodeId !== undefined &&
			getFromChangeAtomIdMap(
				this.builtNodeIds,
				normalizeNodeId(nodeId, this.change.nodeAliases),
			) === true
		);
	}

	private isNodeDetachedInOutput(nodeId: NodeId): boolean {
		return (
			(getFromChangeAtomIdMap(
				this.outputAttachStates,
				normalizeNodeId(nodeId, this.change.nodeAliases),
			) ?? fail("Should have attach state for every node ID")) === NodeAttachState.Detached
		);
	}

	private isFieldDetachedInOutput(fieldId: FieldId): boolean {
		return fieldId.nodeId !== undefined && this.isNodeDetachedInOutput(fieldId.nodeId);
	}

	private shouldSquashDetach(
		fieldId: FieldId,
		rootInputId: ChangeAtomId | undefined,
	): boolean {
		return this.isNodeIdInBuiltTree(fieldId.nodeId) && rootInputId === undefined;
	}

	private shouldSquashAttach(
		fieldId: FieldId,
		rootInputId: ChangeAtomId,
		count: number,
		endpoint: FieldId | undefined,
	): RangeQueryResult<boolean> {
		if (!this.isNodeIdInBuiltTree(fieldId.nodeId)) {
			return { value: false, length: count };
		}

		let countProcessed = count;
		const isMoveOfBuiltRootEntry = this.builtRootIds.getFirst(rootInputId, countProcessed);
		countProcessed = isMoveOfBuiltRootEntry.length;

		const isAttachOfBuiltRoot = isMoveOfBuiltRootEntry?.value ?? false;
		const isMoveFromBuiltTree =
			endpoint?.nodeId !== undefined && this.isNodeIdInBuiltTree(endpoint.nodeId);

		const isAttachOfBuiltNode = isAttachOfBuiltRoot || isMoveFromBuiltTree;
		return { value: isAttachOfBuiltNode, length: countProcessed };
	}

	private shouldDropAttach(
		fieldId: FieldId,
		rootInputId: ChangeAtomId,
		count: number,
		endpoint: FieldId | undefined,
		isTransientAttachOfBuild: boolean,
	): RangeQueryResult<boolean> {
		const isInDetachedTree = this.isFieldDetachedInOutput(fieldId);

		let countProcessed = count;
		const shouldSquashAttachEntry = this.shouldSquashAttach(
			fieldId,
			rootInputId,
			countProcessed,
			endpoint,
		);
		countProcessed = shouldSquashAttachEntry.length;
		return {
			value: isInDetachedTree || shouldSquashAttachEntry.value || isTransientAttachOfBuild,
			length: countProcessed,
		};
	}

	private shouldDropDetach(
		fieldId: FieldId,
		detachId: ChangeAtomId,
		rootInputId: ChangeAtomId | undefined,
		count: number,
		endpoint: FieldId | undefined,
	): RangeQueryResult<boolean> {
		let countProcessed = count;
		if (this.shouldSquashDetach(fieldId, rootInputId)) {
			return { value: true, length: countProcessed };
		}

		if (rootInputId !== undefined) {
			// `inputRootId` is defined when this detach represents the rename of a detached root.
			const isDetachOfBuiltRootEntry = this.builtRootIds.getFirst(rootInputId, countProcessed);
			countProcessed = isDetachOfBuiltRootEntry.length;
			const isDetachOfBuiltRoot = isDetachOfBuiltRootEntry.value !== undefined;
			if (isDetachOfBuiltRoot)
				// If this is a rename of a built node, either it ends detached, or is moved elsewhere.
				// If moved, we squash the detach away, leaving only an attach at the destination.
				// If detached, the build is not used, so we drop the rename.
				return {
					value: true,
					length: countProcessed,
				};
		}

		if (endpoint !== undefined) {
			// We would have returned above if the detached nodes were newly built.
			const isTransientAttachOfBuild = false;
			const shouldDropAttachEntry = this.shouldDropAttach(
				endpoint,
				rootInputId ?? detachId,
				countProcessed,
				fieldId,
				isTransientAttachOfBuild,
			);
			countProcessed = shouldDropAttachEntry.length;

			if (!shouldDropAttachEntry.value) {
				// This detach is part of a move, and we are not dropping the attach, so we must preserve the detach as well.
				return { value: false, length: countProcessed };
			}
		}

		return { value: this.isFieldDetachedInOutput(fieldId), length: countProcessed };
	}

	private filterEditsForBuildChange(fieldChange: FieldChange, fieldId: FieldId): FieldChange {
		return {
			...fieldChange,
			change: brand(
				getChangeHandler(this.fieldKinds, fieldChange.fieldKind).rebaser.filterEdits(
					fieldChange.change,
					{
						filterDetach: (detachId, count, inputRootId, endpoint) =>
							this.filterDetachForBuildChange(fieldId, detachId, count, inputRootId, endpoint),
						filterAttach: (id, count, _outputRootId, endpoint) =>
							this.filterAttachForBuildChange(fieldId, id, count, endpoint),
						preserveOtherEdits: false,
					},
				),
			),
		};
	}

	private filterDetachForBuildChange(
		fieldId: FieldId,
		detachId: ChangeAtomId,
		count: number,
		inputRootId: ChangeAtomId | undefined,
		endpoint?: ChangeAtomId,
	): RangeQueryResult<EditFilterStatus> {
		if (!this.shouldSquashDetach(fieldId, inputRootId)) {
			return { value: EditFilterStatus.Remove, length: count };
		}

		let countProcessed = count;
		const moveEndpointEntry = this.change.crossFieldKeys.getFirst(
			{ ...(endpoint ?? detachId), target: CrossFieldTarget.Destination },
			countProcessed,
		);
		countProcessed = moveEndpointEntry.length;

		if (moveEndpointEntry.value !== undefined) {
			const willSquashEndpointEntry = this.shouldSquashAttach(
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
	}

	private filterAttachForBuildChange(
		fieldId: FieldId,
		id: ChangeAtomId,
		count: number,
		endpoint?: ChangeAtomId,
	): RangeQueryResult<FilterAttachResult> {
		let countProcessed = count;
		const moveId = endpoint ?? id;
		const moveEndpointEntry = this.change.crossFieldKeys.getFirst(
			{ ...moveId, target: CrossFieldTarget.Source },
			countProcessed,
		);
		countProcessed = moveEndpointEntry.length;

		const inputIdEntry = this.outputToInputRootId.getFirst(moveId, countProcessed);
		countProcessed = inputIdEntry.length;

		const rootInputId = inputIdEntry.value ?? moveId;
		const shouldSquashEntry = this.shouldSquashAttach(
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
			const movedNodeId = getFromChangeAtomIdMap(this.rootIdToNodeId, moveId);
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
	}

	private filterEditsForResidualChange(
		fieldChange: FieldChange,
		fieldId: FieldId,
	): FieldChange {
		return {
			...fieldChange,
			change: brand(
				getChangeHandler(this.fieldKinds, fieldChange.fieldKind).rebaser.filterEdits(
					fieldChange.change,
					{
						filterDetach: (...args) => this.filterDetachForResidualChange(fieldId, ...args),
						filterAttach: (...args) => this.filterAttachForResidualChange(fieldId, ...args),
						preserveOtherEdits: false,
					},
				),
			),
		};
	}

	private filterDetachForResidualChange(
		fieldId: FieldId,
		detachId: ChangeAtomId,
		count: number,
		inputRootId: ChangeAtomId | undefined,
		endpoint?: ChangeAtomId,
	): RangeQueryResult<EditFilterStatus> {
		let countProcessed = count;
		const moveEndpointEntry = this.change.crossFieldKeys.getFirst(
			{ ...(endpoint ?? detachId), target: CrossFieldTarget.Destination },
			count,
		);
		countProcessed = moveEndpointEntry.length;

		const shouldDropEntry = this.shouldDropDetach(
			fieldId,
			detachId,
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
			// `shouldDropDetach` would be true and we would have returned already if the moved nodes were newly built.
			const isTransientAttachOfBuild = false;
			const willDropAttachEntry = this.shouldDropAttach(
				moveEndpointEntry.value,
				inputRootId ?? detachId,
				countProcessed,
				fieldId,
				isTransientAttachOfBuild,
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
	}

	private filterAttachForResidualChange(
		fieldId: FieldId,
		id: ChangeAtomId,
		count: number,
		outputRootId: ChangeAtomId | undefined,
		endpoint?: ChangeAtomId,
	): RangeQueryResult<FilterAttachResult> {
		let countProcessed = count;
		const moveId = endpoint ?? id;
		const moveEndpointEntry = this.change.crossFieldKeys.getFirst(
			{ ...moveId, target: CrossFieldTarget.Source },
			countProcessed,
		);
		countProcessed = moveEndpointEntry.length;

		const inputIdEntry = this.outputToInputRootId.getFirst(moveId, countProcessed);
		countProcessed = inputIdEntry.length;

		const rootInputId = inputIdEntry.value ?? moveId;

		const isBuiltRootEntry = this.builtRootIds.getFirst(rootInputId, countProcessed);
		countProcessed = isBuiltRootEntry.length;

		const isTransientAttachOfRoot =
			outputRootId !== undefined && isBuiltRootEntry.value === true;

		const shouldDropEntry = this.shouldDropAttach(
			fieldId,
			rootInputId,
			countProcessed,
			moveEndpointEntry.value,
			isTransientAttachOfRoot,
		);
		countProcessed = shouldDropEntry.length;

		if (shouldDropEntry.value) {
			return {
				value: { action: EditFilterStatus.Remove },
				length: countProcessed,
			};
		}

		if (moveEndpointEntry.value !== undefined) {
			const willDropEndpointEntry = this.shouldDropDetach(
				moveEndpointEntry.value,
				moveId,
				inputIdEntry.value,
				countProcessed,
				fieldId,
			);
			countProcessed = willDropEndpointEntry.length;
			if (willDropEndpointEntry.value) {
				const movedNodeId = getFromChangeAtomIdMap(this.rootIdToNodeId, moveId);
				return {
					value: {
						action: EditFilterStatus.PreserveWithoutMove,
						nodeId: movedNodeId,
						newAttachId: inputIdEntry.value ?? moveId,
					},
					length: countProcessed,
				};
			}
		}

		return {
			value: { action: EditFilterStatus.Preserve },
			length: countProcessed,
		};
	}

	private squashBuilds(forestFactory: () => IEditableForest): ChangeAtomIdBTree<TreeChunk> {
		const changeForBuilds = filterEdits(
			this.change,
			this.filterEditsForBuildChange.bind(this),
		);

		const deltaForBuilds = intoDelta(makeAnonChange(changeForBuilds), this.fieldKinds);
		const forest = forestFactory();
		const detachedFieldIndex = makeDetachedFieldIndex();

		visitDelta(deltaForBuilds, forest.acquireVisitor(), detachedFieldIndex, undefined);
		const squashedBuilds = newChangeAtomIdBTree<TreeChunk>();
		const cursor = forest.getCursorAboveDetachedFields();
		for (const entry of detachedFieldIndex.entries()) {
			cursor.enterField(detachedFieldIndex.toFieldKey(entry.root));
			const chunks = forest.chunkField(cursor);
			assert(chunks.length === 1, "TODO: Handle multiple chunks");
			const chunk = chunks[0] ?? fail("Expected at least one chunk");
			assert(chunk.topLevelLength === 1, "TODO: Handle chunk with range of nodes");

			const rootId: ChangeAtomId = {
				revision: entry.id.major,
				localId: brand(entry.id.minor),
			};

			const isAttachedEntry = this.attachedRootIds.getFirst(rootId, chunk.topLevelLength);
			assert(
				isAttachedEntry.length === chunk.topLevelLength,
				"TODO: Handle chunks which are only partially attached",
			);

			if (isAttachedEntry.value) {
				setInChangeAtomIdMap(squashedBuilds, rootId, chunk);
			}

			cursor.exitField();
		}

		return squashedBuilds;
	}
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
	readonly builtRootIds: ChangeAtomIdRangeMap<true>;
	readonly builtNodeIds: ChangeAtomIdBTree<true>;
	/**
	 * Maps from the input context ID for roots which are already detached,
	 * or detach ID for roots which are detached or moved by `change`.
	 */
	readonly rootIdToNodeId: ChangeAtomIdBTree<NodeId>;
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
