/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	deltaFieldMapHasChanges,
	makeAnonChange,
	makeChangeAtomId,
	makeDetachedFieldIndex,
	newChangeAtomIdRangeMap,
	offsetChangeAtomId,
	visitDelta,
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type DeltaRoot,
	type FieldKindIdentifier,
	type IEditableForest,
	type TreeChunk,
} from "../../core/index.js";
import { brand, hasSingle, type Mutable, type RangeQueryResult } from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	rangeQueryChangeAtomIdMap,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import { NodeMoveType } from "./crossFieldQueries.js";
import {
	EditFilterStatus,
	NodeAttachState,
	type FilterDetachResult,
} from "./fieldChangeHandler.js";

import type { FlexFieldKind } from "./fieldKind.js";
import { filterEdits } from "./filterEdits.js";
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
	assignRootChange,
	firstDetachIdFromAttachId,
	getAttachFieldForDetach,
	getChangeHandler,
	getDetachFieldForAttach,
	getFirstAttachField,
	getFirstDetachField,
	getOldRootIdFromNewRootId,
	nodeChangeFromId,
	normalizeNodeId,
	validateChangeset,
} from "./modularChangeUtils.js";
import { assert, fail } from "@fluidframework/core-utils/internal";

/**
 * "Minimizes" a {@link ModularChangeset} so that it contains no extraneous
 * information, i.e. no new content that isn't observable from document tree
 * and no edits without net observed effect on the document tree.
 * @remarks
 * "Extraneous information" includes, for example, data for nodes that were both created and removed within the same
 * transaction, or changes whose effects cancel out to nothing. Minimizing reduces the size of an edit without altering
 * its observable effect.
 *
 * @param change - The change to minimize.
 * @param fieldKinds - The field kinds used in the changeset.
 * @param forestFactory - A function that returns a new forest instance.
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

	/**
	 * This contains the set of root IDs associated with built nodes.
	 * Note that this includes both IDs for built roots as well as the detach IDs for nodes detached from another build tree.
	 */
	private readonly builtRootIds: ChangeAtomIdRangeMap<true>;
	private readonly outputAttachStates: ChangeAtomIdBTree<NodeAttachState>;
	private readonly rootIdToNodeId: ChangeAtomIdBTree<NodeId>;

	public constructor(
		private readonly change: ModularChangeset,
		private readonly fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	) {
		this.outputAttachStates = getOutputNodeAttachStates(change, fieldKinds);
		const nodeInfo = getNodeInfo(change, fieldKinds);
		this.builtNodeIds = nodeInfo.builtNodeIds;
		this.builtRootIds = nodeInfo.builtRootIds;
		this.rootIdToNodeId = nodeInfo.rootIdToNodeId;
	}

	public minimize(forestFactory: () => IEditableForest): ModularChangeset {
		const residualChange: Mutable<ModularChangeset> = filterEdits(
			this.change,
			this.filterEditsForResidualChange.bind(this),
			this.filterRenamesForResidualChange.bind(this),
			this.fieldKinds,
		);

		this.squashBuilds(residualChange, forestFactory);
		this.updateResidualBuiltNodeLocations(residualChange);

		validateChangeset(residualChange, this.fieldKinds);
		return residualChange;
	}

	/**
	 * Updates the locations of built nodes which the input change detached from other builds.
	 * The detaches are squashed into the build trees,
	 * so in the residual change these nodes should be represented under their new root locations.
	 */
	private updateResidualBuiltNodeLocations(residualChange: ModularChangeset): void {
		for (const rootEntry of this.builtRootIds.entries()) {
			let rootId = rootEntry.start;
			let countRemaining = rootEntry.length;
			while (countRemaining > 0) {
				const nodeIdEntry = rangeQueryChangeAtomIdMap(
					this.rootIdToNodeId,
					rootId,
					countRemaining,
				);

				// Even if there was a node changeset for this root, it may have been pruned away.
				// We check that it still exists before updating its location in the residual change.
				if (
					nodeIdEntry.value !== undefined &&
					getFromChangeAtomIdMap(residualChange.nodeChanges, nodeIdEntry.value) !== undefined
				) {
					const detachLocation =
						this.change.rootNodes.detachLocations.getFirst(rootId, 1).value ??
						getFirstDetachField(this.change.crossFieldKeys, rootId, 1).value;

					assignRootChange(
						residualChange.rootNodes,
						residualChange.nodeToParent,
						rootId,
						nodeIdEntry.value,
						detachLocation,
						residualChange.rebaseVersion,
					);
				}

				rootId = offsetChangeAtomId(rootId, nodeIdEntry.length);
				countRemaining -= nodeIdEntry.length;
			}
		}
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
			) ?? fail(0xd37 /* Should have attach state for every node ID */)) ===
			NodeAttachState.Detached
		);
	}

	private isFieldDetachedInOutput(fieldId: FieldId): boolean {
		return fieldId.nodeId !== undefined && this.isNodeDetachedInOutput(fieldId.nodeId);
	}

	private shouldSquashDetach(fieldId: FieldId): boolean {
		return this.isNodeIdInBuiltTree(fieldId.nodeId);
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

		// XXX: This should now already be handled by the builtRootIds check.
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
			value: isInDetachedTree || shouldSquashAttachEntry.value,
			length: countProcessed,
		};
	}

	private shouldDropDetach(
		fieldId: FieldId,
		detachId: ChangeAtomId,
		count: number,
		endpoint: FieldId | undefined,
	): RangeQueryResult<boolean> {
		let countProcessed = count;
		if (this.shouldSquashDetach(fieldId)) {
			return { value: true, length: countProcessed };
		}

		if (endpoint !== undefined) {
			const shouldDropAttachEntry = this.shouldDropAttach(
				endpoint,
				detachId,
				countProcessed,
				fieldId,
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
						filterDetach: (detachId, count) =>
							this.filterDetachForBuildChange(fieldId, detachId, count),
						filterAttach: (id, count) => this.filterAttachForBuildChange(fieldId, id, count),
						preserveOtherEdits: false,
					},
				),
			),
		};
	}

	private filterRenamesForBuildChange(
		oldId: ChangeAtomId,
		_newId: ChangeAtomId,
		count: number,
	): RangeQueryResult<EditFilterStatus> {
		const shouldSquashEntry = this.shouldSquashRename(oldId, count);
		return {
			value: shouldSquashEntry.value ? EditFilterStatus.Preserve : EditFilterStatus.Remove,
			length: shouldSquashEntry.length,
		};
	}

	private shouldSquashRename(
		inputRootId: ChangeAtomId,
		count: number,
	): RangeQueryResult<boolean> {
		let countProcessed = count;
		const isRenameOfBuiltRootEntry = this.builtRootIds.getFirst(inputRootId, count);
		countProcessed = isRenameOfBuiltRootEntry.length;
		return {
			value: isRenameOfBuiltRootEntry.value === true,
			length: countProcessed,
		};
	}

	private filterDetachForBuildChange(
		fieldId: FieldId,
		detachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<FilterDetachResult> {
		let countProcessed = count;

		if (!this.shouldSquashDetach(fieldId)) {
			return {
				value: { action: EditFilterStatus.Remove },
				length: countProcessed,
			};
		}

		const moveEndpointEntry = getAttachFieldForDetach(
			this.change.crossFieldKeys,
			this.change.rootNodes,
			detachId,
			countProcessed,
		);
		countProcessed = moveEndpointEntry.length;

		return { value: { action: EditFilterStatus.Preserve }, length: countProcessed };
	}

	private filterAttachForBuildChange(
		fieldId: FieldId,
		id: ChangeAtomId,
		count: number,
	): RangeQueryResult<EditFilterStatus> {
		let countProcessed = count;
		const moveEndpointEntry = getDetachFieldForAttach(
			this.change.crossFieldKeys,
			this.change.rootNodes,
			id,
			countProcessed,
		);
		countProcessed = moveEndpointEntry.length;

		const inputIdEntry = firstDetachIdFromAttachId(this.change.rootNodes, id, countProcessed);
		countProcessed = inputIdEntry.length;

		const rootInputId = inputIdEntry.value;
		const shouldSquashEntry = this.shouldSquashAttach(
			fieldId,
			rootInputId,
			countProcessed,
			moveEndpointEntry.value,
		);
		countProcessed = shouldSquashEntry.length;

		if (!shouldSquashEntry.value) {
			return { value: EditFilterStatus.Remove, length: countProcessed };
		}

		return {
			value: EditFilterStatus.Preserve,
			length: countProcessed,
		};
	}

	/**
	 * Returns a version of `fieldChange` to be used in the final minimized change.
	 * The filtered change will have dropped:
	 * - Edits which were squashed into the built trees.
	 * - Detaches of built roots. If part of a move, these are instead represented as an attach at the final location.
	 * - Edits to nodes which are detached in the output, except for detaches of content which does end attached.
	 */
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

	private filterRenamesForResidualChange(
		oldId: ChangeAtomId,
		newId: ChangeAtomId,
		count: number,
	): RangeQueryResult<EditFilterStatus> {
		const result = this.shouldDropRename(oldId, count);
		return {
			...result,
			value: result.value ? EditFilterStatus.Remove : EditFilterStatus.Preserve,
		};
	}

	private shouldDropRename(inputId: ChangeAtomId, count: number): RangeQueryResult<boolean> {
		let countProcessed = count;
		const shouldSquashEntry = this.shouldSquashRename(inputId, countProcessed);
		countProcessed = shouldSquashEntry.length;

		if (shouldSquashEntry.value) {
			return { value: true, length: countProcessed };
		}

		const attachEntry = getAttachFieldForDetach(
			this.change.crossFieldKeys,
			this.change.rootNodes,
			inputId,
			countProcessed,
		);
		countProcessed = attachEntry.length;

		if (attachEntry.value !== undefined) {
			const detachEntry = getFirstDetachField(
				this.change.crossFieldKeys,
				inputId,
				countProcessed,
			);
			countProcessed = detachEntry.length;

			const willDropAttachEntry = this.shouldDropAttach(
				attachEntry.value,
				inputId,
				countProcessed,
				detachEntry.value,
			);
			countProcessed = willDropAttachEntry.length;

			return { value: willDropAttachEntry.value, length: countProcessed };
		}

		// We can safely discard any rename which does not have an associated attach which is preserved.
		return { value: true, length: countProcessed };
	}

	private filterDetachForResidualChange(
		fieldId: FieldId,
		detachId: ChangeAtomId,
		count: number,
	): RangeQueryResult<FilterDetachResult> {
		let countProcessed = count;
		const moveEndpointEntry = getAttachFieldForDetach(
			this.change.crossFieldKeys,
			this.change.rootNodes,
			detachId,
			countProcessed,
		);
		countProcessed = moveEndpointEntry.length;

		const shouldDropEntry = this.shouldDropDetach(
			fieldId,
			detachId,
			countProcessed,
			moveEndpointEntry.value,
		);
		countProcessed = shouldDropEntry.length;

		if (shouldDropEntry.value) {
			// If this is a detach from a built node, the detach has been squashed into the build trees
			// and the detached node will be a root in the input context,
			// so we should not represent any child change here.
			const isDetachFromBuild = this.isNodeIdInBuiltTree(fieldId.nodeId);
			return {
				value: { action: EditFilterStatus.Remove, shouldRemoveChild: isDetachFromBuild },
				length: countProcessed,
			};
		}

		return {
			value: {
				action: EditFilterStatus.Preserve,
			},
			length: countProcessed,
		};
	}

	private filterAttachForResidualChange(
		fieldId: FieldId,
		id: ChangeAtomId,
		count: number,
	): RangeQueryResult<EditFilterStatus> {
		let countProcessed = count;
		const moveEndpointEntry = getDetachFieldForAttach(
			this.change.crossFieldKeys,
			this.change.rootNodes,
			id,
			countProcessed,
		);

		countProcessed = moveEndpointEntry.length;

		const inputIdEntry = getOldRootIdFromNewRootId(this.change.rootNodes, id, countProcessed);
		countProcessed = inputIdEntry.length;

		const rootInputId = inputIdEntry.value ?? id;
		const shouldDropEntry = this.shouldDropAttach(
			fieldId,
			rootInputId,
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
			const willDropEndpointEntry = this.shouldDropDetach(
				moveEndpointEntry.value,
				id,
				countProcessed,
				fieldId,
			);
			countProcessed = willDropEndpointEntry.length;
			if (willDropEndpointEntry.value) {
				return {
					value: EditFilterStatus.Preserve,
					length: countProcessed,
				};
			}
		}

		return {
			value: EditFilterStatus.Preserve,
			length: countProcessed,
		};
	}

	private squashBuilds(
		residualChange: Mutable<ModularChangeset>,
		forestFactory: () => IEditableForest,
	): void {
		const changeForBuilds = filterEdits(
			this.change,
			this.filterEditsForBuildChange.bind(this),
			this.filterRenamesForBuildChange.bind(this),
			this.fieldKinds,
		);

		const deltaForBuilds = intoDelta(makeAnonChange(changeForBuilds), this.fieldKinds);
		assert(
			!deltaFieldMapHasChanges(deltaForBuilds.fields),
			0xd38 /* Expected all changes to attached tree to be filtered out */,
		);

		// There may still be paths to existing nodes in the delta, which must be removed before being applied to an empty forest.
		// It is safe to remove these, because there are no edits to them, as asserted above.
		(deltaForBuilds as Mutable<DeltaRoot<unknown>>).fields = new Map();

		const forest = forestFactory();
		const detachedFieldIndex = makeDetachedFieldIndex();

		visitDelta(deltaForBuilds, forest.acquireVisitor(), detachedFieldIndex, undefined);
		const squashedBuilds = newChangeAtomIdBTree<TreeChunk>();
		const cursor = forest.getCursorAboveDetachedFields();
		for (const entry of detachedFieldIndex.entries()) {
			cursor.enterField(detachedFieldIndex.toFieldKey(entry.root));
			const chunks = forest.chunkField(cursor);

			// Delta visiting currently splits ranges of nodes into individual elements,
			// so for now we will not have more than one node in a detached field.
			assert(hasSingle(chunks), 0xd39 /* TODO: Handle multiple chunks */);
			const chunk = chunks[0];
			assert(chunk.topLevelLength === 1, 0xd3a /* TODO: Handle chunk with range of nodes */);

			const rootId: ChangeAtomId = {
				revision: entry.id.major,
				localId: brand(entry.id.minor),
			};

			const attachEntry = getAttachFieldForDetach(
				residualChange.crossFieldKeys,
				residualChange.rootNodes,
				rootId,
				chunk.topLevelLength,
			);
			assert(
				attachEntry.length === chunk.topLevelLength,
				0xd3b /* TODO: Handle chunks which are only partially attached */,
			);

			const isAttached = attachEntry.value !== undefined;
			if (isAttached) {
				setInChangeAtomIdMap(squashedBuilds, rootId, chunk);
			}

			cursor.exitField();
		}

		residualChange.builds = squashedBuilds;
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

	for (const nodeId of change.rootNodes.nodeChanges.values()) {
		addInputNodeAttachStatesRecursive(
			NodeAttachState.Detached,
			nodeId,
			change.nodeChanges,
			change.nodeAliases,
			fieldKinds,
			nodeAttachStates,
		);
	}
	return nodeAttachStates;
}

function addInputNodeAttachStatesForFields(
	attachState: NodeAttachState,
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

		for (const { nodeId } of children) {
			addInputNodeAttachStatesRecursive(
				attachState,
				nodeId,
				nodes,
				nodeAliases,
				fieldKinds,
				nodeAttachStates,
			);
		}
	}
}

function addInputNodeAttachStatesRecursive(
	attachState: NodeAttachState,
	nodeId: NodeId,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	nodeAttachStates: ChangeAtomIdBTree<NodeAttachState>,
): void {
	const normalizedNodeId = normalizeNodeId(nodeId, nodeAliases);
	nodeAttachStates.set([normalizedNodeId.revision, normalizedNodeId.localId], attachState);

	const nodeChangeset = nodeChangeFromId(nodes, nodeAliases, normalizedNodeId);
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
	const builtNodeIds = newChangeAtomIdBTree<true>();
	const builtRootIds = newChangeAtomIdRangeMap<true>();
	if (change.builds !== undefined) {
		for (const [rootIdKey, chunk] of change.builds.entries()) {
			const rootId = makeChangeAtomId(rootIdKey[1], rootIdKey[0]);
			builtRootIds.set(rootId, chunk.topLevelLength, true);
		}
	}

	const rootIdToNodeId = newChangeAtomIdBTree<NodeId>();
	addRootIdToNodeIdForFields(
		change.fieldChanges,
		change.nodeChanges,
		change.nodeAliases,
		fieldKinds,
		rootIdToNodeId,
	);

	for (const [rootIdKey, nodeId] of change.rootNodes.nodeChanges.entries()) {
		const rootId = makeChangeAtomId(rootIdKey[1], rootIdKey[0]);
		setInChangeAtomIdMap(rootIdToNodeId, rootId, normalizeNodeId(nodeId, change.nodeAliases));

		if (builtRootIds.getFirst(rootId, 1).value) {
			addBuiltNodeIdsRecursive(
				nodeId,
				change.nodeChanges,
				change.nodeAliases,
				fieldKinds,
				builtNodeIds,
				builtRootIds,
			);
		}
	}

	return { builtRootIds, builtNodeIds, rootIdToNodeId };
}

function addBuiltNodeIdsRecursive(
	nodeId: NodeId,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	builtNodeIds: ChangeAtomIdBTree<true>,
	builtRootIds: ChangeAtomIdRangeMap<true>,
): void {
	const nodeChangeset = nodeChangeFromId(nodes, nodeAliases, nodeId);
	setInChangeAtomIdMap(builtNodeIds, nodeId, true);
	if (nodeChangeset.fieldChanges !== undefined) {
		for (const fieldChange of nodeChangeset.fieldChanges.values()) {
			const changeHandler = getChangeHandler(fieldKinds, fieldChange.fieldKind);
			const children = changeHandler.getNestedChanges(fieldChange.change);
			for (const { nodeId: childNodeId } of children) {
				addBuiltNodeIdsRecursive(
					childNodeId,
					nodes,
					nodeAliases,
					fieldKinds,
					builtNodeIds,
					builtRootIds,
				);
			}

			const nodeMoves = changeHandler.getCrossFieldKeys(fieldChange.change);
			for (const nodeMove of nodeMoves) {
				if (nodeMove.key.target === NodeMoveType.Detach) {
					builtRootIds.set(
						makeChangeAtomId(nodeMove.key.localId, nodeMove.key.revision),
						1,
						true,
					);
				}
			}
		}
	}
}

function addRootIdToNodeIdForFields(
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	nodeAliases: ChangeAtomIdBTree<NodeId>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	rootIdToNodeId: ChangeAtomIdBTree<NodeId>,
): void {
	for (const fieldChange of fields.values()) {
		const children = getChangeHandler(fieldKinds, fieldChange.fieldKind).getNestedChanges(
			fieldChange.change,
		);

		for (const { nodeId, detachId } of children) {
			const normalizedNodeId = normalizeNodeId(nodeId, nodeAliases);

			if (detachId !== undefined) {
				setInChangeAtomIdMap(rootIdToNodeId, detachId, normalizedNodeId);
			}

			const nodeChangeset = nodeChangeFromId(nodes, nodeAliases, normalizedNodeId);
			if (nodeChangeset.fieldChanges !== undefined) {
				addRootIdToNodeIdForFields(
					nodeChangeset.fieldChanges,
					nodes,
					nodeAliases,
					fieldKinds,
					rootIdToNodeId,
				);
			}
		}
	}
}
