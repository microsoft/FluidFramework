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
	visitDelta,
	type ChangeAtomId,
	type ChangeAtomIdRangeMap,
	type FieldKindIdentifier,
	type RevisionTagCodec,
	type TreeChunk,
} from "../../core/index.js";
import { brand, Breakable, type Mutable, type RangeQueryResult } from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	newChangeAtomIdBTree,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";
import { buildForest } from "../object-forest/index.js";
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
import { filterEdits, getChangeHandler, nodeChangeFromId } from "./modularChangeUtils.js";

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
): ModularChangeset {
	const outputAttachStates = getOutputNodeAttachStates(change, fieldKinds);
	const builtNodeIds = getBuiltNodeIds(change, fieldKinds);

	function isNodeIdInBuiltTree(nodeId: NodeId | undefined): boolean {
		return nodeId !== undefined && getFromChangeAtomIdMap(builtNodeIds, nodeId) === true;
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
	const forest = buildForest(new Breakable("squash"));
	const detachedFieldIndex = makeDetachedFieldIndex(
		undefined,
		undefined as unknown as RevisionTagCodec,
		undefined as unknown as IIdCompressor,
	);

	visitDelta(deltaForBuilds, forest.acquireVisitor(), detachedFieldIndex, undefined);
	const squashedBuilds = newChangeAtomIdBTree<TreeChunk>();
	const cursor = forest.allocateCursor();
	for (const entry of detachedFieldIndex.entries()) {
		cursor.enterField(detachedFieldIndex.toFieldKey(entry.root));
		const chunk = forest.chunkField(cursor);
		cursor.exitField();
	}
	cursor.free();

	const filterEditsForResidualChange = (
		fieldChange: FieldChange,
		nodeId: NodeId | undefined,
	): FieldChange => {
		const filterDetach = (
			id: ChangeAtomId,
			count: number,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			return {
				value: isNodeIdInBuiltTree(nodeId)
					? EditFilterStatus.Remove
					: EditFilterStatus.Preserve,
				length: count,
			};
		};

		const filterAttach = (
			id: ChangeAtomId,
			count: number,
			endpoint?: ChangeAtomId,
		): RangeQueryResult<EditFilterStatus> => {
			const moveEndpointEntry = change.crossFieldKeys.getFirst(
				{ ...(endpoint ?? id), target: CrossFieldTarget.Source },
				count,
			);

			if (isNodeIdInBuiltTree(nodeId)) {
				const isMoveFromExistingTree =
					moveEndpointEntry.value !== undefined &&
					!isFieldIdInBuiltTree(moveEndpointEntry.value);

				// Moves of existing content could not be squashed into the build,
				// so they must remain in the residual change.
				return {
					value: isMoveFromExistingTree ? EditFilterStatus.Preserve : EditFilterStatus.Remove,
					length: moveEndpointEntry.length,
				};
			}

			const isMoveFromBuiltTree =
				moveEndpointEntry.value !== undefined && isFieldIdInBuiltTree(moveEndpointEntry.value);

			// The detach of the moved node will have already been squashed into the builds,
			// so we only need to preserve the attach.
			const result = isMoveFromBuiltTree
				? EditFilterStatus.PreserveWithoutMove
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

	const residualChange = filterEdits(change, filterEditsForResidualChange);
	(residualChange as Mutable<ModularChangeset>).builds = squashedBuilds;
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
		fieldKinds,
		nodeAttachStates,
	);
	return nodeAttachStates;
}

function addInputNodeAttachStatesForFields(
	parentState: NodeAttachState,
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	nodeAttachStates: ChangeAtomIdBTree<NodeAttachState>,
): void {
	for (const fieldChange of fields.values()) {
		const children = getChangeHandler(fieldKinds, fieldChange.fieldKind).getNestedChanges(
			fieldChange.change,
		);

		for (const [nodeId, inputId, _outputId] of children) {
			const attachState =
				parentState === NodeAttachState.Attached && inputId === undefined
					? NodeAttachState.Attached
					: NodeAttachState.Detached;

			nodeAttachStates.set([nodeId.revision, nodeId.localId], attachState);

			const nodeChangeset = nodeChangeFromId(nodes, nodeId);
			if (nodeChangeset.fieldChanges !== undefined) {
				addInputNodeAttachStatesForFields(
					attachState,
					nodeChangeset.fieldChanges,
					nodes,
					fieldKinds,
					nodeAttachStates,
				);
			}
		}
	}
}

function getBuiltNodeIds(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): ChangeAtomIdBTree<boolean> {
	const builtNodeIds = newChangeAtomIdBTree<boolean>();

	const buildIds = newChangeAtomIdRangeMap<boolean>();
	if (change.builds !== undefined) {
		for (const [rootId, chunk] of change.builds.entries()) {
			buildIds.set(makeChangeAtomId(rootId[1], rootId[0]), chunk.topLevelLength, true);
		}
	}

	addBuiltNodeIdsForFields(
		false,
		change.fieldChanges,
		change.nodeChanges,
		buildIds,
		fieldKinds,
		builtNodeIds,
	);
	return builtNodeIds;
}

function addBuiltNodeIdsForFields(
	parentIsBuilt: boolean,
	fields: FieldChangeMap,
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	buildIds: ChangeAtomIdRangeMap<boolean>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	builtNodeIds: ChangeAtomIdBTree<boolean>,
): void {
	for (const fieldChange of fields.values()) {
		const children = getChangeHandler(fieldKinds, fieldChange.fieldKind).getNestedChanges(
			fieldChange.change,
		);

		for (const [nodeId, inputId, _outputId] of children) {
			const isPartOfBuild =
				parentIsBuilt ||
				(inputId !== undefined && buildIds.getFirst(inputId, 1).value === true);

			if (isPartOfBuild) {
				builtNodeIds.set([nodeId.revision, nodeId.localId], true);
			}

			const nodeChangeset = nodeChangeFromId(nodes, nodeId);
			if (nodeChangeset.fieldChanges !== undefined) {
				addBuiltNodeIdsForFields(
					isPartOfBuild,
					nodeChangeset.fieldChanges,
					nodes,
					buildIds,
					fieldKinds,
					builtNodeIds,
				);
			}
		}
	}
}
