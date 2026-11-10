/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	makeAnonChange,
	makeDetachedNodeId,
	offsetChangeAtomId,
	offsetDetachId,
	type ChangeAtomId,
	type DeltaDetachedNodeBuild,
	type DeltaDetachedNodeChanges,
	type DeltaDetachedNodeDestruction,
	type DeltaDetachedNodeId,
	type DeltaDetachedNodeRename,
	type DeltaFieldChanges,
	type DeltaFieldMap,
	type DeltaMark,
	type DeltaRoot,
	type FieldKey,
	type FieldKindIdentifier,
	type TaggedChange,
	type TreeChunk,
} from "../../core/index.js";
import {
	hasConflict,
	merge,
	type Mutable,
	type RangeMapEntry,
	type RangeQueryResult,
} from "../../util/index.js";
import type { ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import {
	changeAtomIdFromNodeId,
	createDeltaMark,
	nodeIdFromChangeAtom,
} from "../deltaUtils.js";
import { makeDummyChunk } from "./chunkUtils.js";
import type { FlexFieldKind } from "./fieldKind.js";
import type { FieldChangeMap, ModularChangeset, NodeChangeset } from "./modularChangeTypes.js";
import {
	firstAttachIdFromDetachId,
	firstDetachIdFromAttachId,
	getChangeHandler,
	getFirstAttachField,
	getFirstDetachField,
	hasConflicts,
	nodeChangeFromId,
	normalizeChangeset,
} from "./modularChangeUtils.js";

/**
 * Converts a change into the delta format.
 *
 * @param change - The change to convert into a delta.
 * @param fieldKinds - The field kinds to delegate to.
 */
export function intoDelta(
	taggedChange: TaggedChange<ModularChangeset>,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): DeltaRoot {
	const change = taggedChange.change;
	const rootDelta: Mutable<DeltaRoot> = {};

	if (!hasConflicts(change)) {
		// If there are no constraint violations, then tree changes apply.
		const fieldDeltas = intoDeltaImpl(change.fieldChanges, change, fieldKinds);

		const global: DeltaDetachedNodeChanges[] = [];
		for (const [[major, minor], nodeId] of change.rootNodes.nodeChanges.entries()) {
			global.push({
				id: { major, minor },
				fields: deltaFromNodeChange(
					nodeChangeFromId(change.nodeChanges, change.nodeAliases, nodeId),
					change,
					fieldKinds,
				),
			});
		}

		const rename = getRenamesForDelta(change);

		if (fieldDeltas.size > 0) {
			rootDelta.fields = fieldDeltas;
		}
		if (global.length > 0) {
			rootDelta.global = global;
		}
		if (rename.length > 0) {
			rootDelta.rename = rename;
		}
	}

	// Constraint violations should not prevent nodes from being built
	if (change.builds && change.builds.size > 0) {
		rootDelta.build = copyDetachedNodes(change.builds);
	}
	if (change.destroys !== undefined && change.destroys.size > 0) {
		const destroys: DeltaDetachedNodeDestruction[] = [];
		for (const [[major, minor], count] of change.destroys.entries()) {
			destroys.push({
				id: makeDetachedNodeId(major, minor),
				count,
			});
		}
		rootDelta.destroy = destroys;
	}
	if (change.refreshers && change.refreshers.size > 0) {
		rootDelta.refreshers = copyDetachedNodes(change.refreshers);
	}

	return rootDelta;
}

function getRenamesForDelta(change: ModularChangeset): DeltaDetachedNodeRename[] {
	const result: DeltaDetachedNodeRename[] = [];
	for (const entry of change.rootNodes.oldToNewId.entries()) {
		let remainder: RangeMapEntry<ChangeAtomId, ChangeAtomId> | undefined = entry;
		while (remainder !== undefined) {
			let count: number = remainder.length;
			const detachEntry = getFirstDetachField(change.crossFieldKeys, remainder.start, count);
			count = detachEntry.length;
			const attachEntry = getFirstAttachField(change.crossFieldKeys, remainder.value, count);
			count = attachEntry.length;

			// Renames associated with an attach or detach are inlined in `inlineRenamesInFieldDelta,
			// so we don't include them in the delta.
			if (detachEntry.value === undefined && attachEntry.value === undefined) {
				result.push({
					count,
					oldId: nodeIdFromChangeAtom(remainder.start),
					newId: nodeIdFromChangeAtom(remainder.value),
				});
			}

			remainder =
				count < remainder.length
					? {
							length: remainder.length - count,
							start: offsetChangeAtomId(remainder.start, count),
							value: offsetChangeAtomId(remainder.value, count),
						}
					: undefined;
		}
	}

	return result;
}

function copyDetachedNodes(
	detachedNodes: ChangeAtomIdBTree<TreeChunk>,
): DeltaDetachedNodeBuild[] | undefined {
	const copiedDetachedNodes: DeltaDetachedNodeBuild[] = [];
	for (const [[major, minor], chunk] of detachedNodes.entries()) {
		if (chunk.topLevelLength > 0) {
			chunk.referenceAdded();
			copiedDetachedNodes.push({
				id: makeDetachedNodeId(major, minor),
				trees: chunk,
			});
		}
	}
	return copiedDetachedNodes.length > 0 ? copiedDetachedNodes : undefined;
}

/**
 * @param fieldMap - The change to convert into a delta.
 */
function intoDeltaImpl(
	fieldMap: FieldChangeMap,
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): Map<FieldKey, DeltaFieldChanges> {
	const delta: Map<FieldKey, DeltaFieldChanges> = new Map();

	for (const [field, fieldChange] of fieldMap) {
		const fieldDelta = getChangeHandler(fieldKinds, fieldChange.fieldKind).intoDelta(
			fieldChange.change,
			(childChange): DeltaFieldMap => {
				const nodeChange = nodeChangeFromId(
					change.nodeChanges,
					change.nodeAliases,
					childChange,
				);
				return deltaFromNodeChange(nodeChange, change, fieldKinds);
			},
		);
		if (fieldDelta !== undefined && fieldDelta.marks.length > 0) {
			delta.set(field, inlineRenamesInFieldDelta(fieldDelta, change));
		}
	}
	return delta;
}

function inlineRenamesInFieldDelta(
	delta: DeltaFieldChanges,
	change: ModularChangeset,
): DeltaFieldChanges {
	const result: DeltaMark[] = [];
	for (const mark of delta.marks) {
		let remainder: DeltaMark | undefined = mark;
		while (remainder !== undefined) {
			const detachEntry = getNormalizedDeltaDetachId(
				change,
				remainder.detach,
				remainder.count,
			);
			const attachEntry = getNormalizedDeltaAttachId(
				change,
				remainder.attach,
				detachEntry.length,
			);
			const countProcessed = attachEntry.length;

			result.push(
				createDeltaMark(
					countProcessed,
					remainder.fields,
					detachEntry.value,
					attachEntry.value,
				),
			);

			const countRemaining: number = remainder.count - countProcessed;
			if (countRemaining === 0) {
				remainder = undefined;
			} else {
				const offsetDetach: DeltaDetachedNodeId | undefined =
					remainder.detach === undefined
						? undefined
						: offsetDetachId(remainder.detach, countProcessed);

				const offsetAttach: DeltaDetachedNodeId | undefined =
					remainder.attach === undefined
						? undefined
						: offsetDetachId(remainder.attach, countProcessed);

				remainder = {
					count: countRemaining,
					detach: offsetDetach,
					attach: offsetAttach,
				};
			}
		}
	}

	return { marks: result };
}

function getNormalizedDeltaDetachId(
	change: ModularChangeset,
	deltaDetachId: DeltaDetachedNodeId | undefined,
	count: number,
): RangeQueryResult<DeltaDetachedNodeId | undefined> {
	if (deltaDetachId === undefined) {
		return { value: undefined, length: count };
	}

	let countProcessed = count;
	const detachId = changeAtomIdFromNodeId(deltaDetachId);
	const outputIdEntry = firstAttachIdFromDetachId(change.rootNodes, detachId, countProcessed);
	countProcessed = outputIdEntry.length;

	const attachEntry = getFirstAttachField(
		change.crossFieldKeys,
		outputIdEntry.value,
		countProcessed,
	);
	countProcessed = attachEntry.length;

	const result =
		attachEntry.value === undefined
			? nodeIdFromChangeAtom(outputIdEntry.value)
			: deltaDetachId;

	return { value: result, length: countProcessed };
}

function getNormalizedDeltaAttachId(
	change: ModularChangeset,
	deltaAttachId: DeltaDetachedNodeId | undefined,
	count: number,
): RangeQueryResult<DeltaDetachedNodeId | undefined> {
	if (deltaAttachId === undefined) {
		return { value: undefined, length: count };
	}

	let countProcessed = count;
	const attachId = changeAtomIdFromNodeId(deltaAttachId);
	const inputIdEntry = firstDetachIdFromAttachId(change.rootNodes, attachId, countProcessed);
	countProcessed = inputIdEntry.length;
	return { value: nodeIdFromChangeAtom(inputIdEntry.value), length: countProcessed };
}

function deltaFromNodeChange(
	nodeChange: NodeChangeset,
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): DeltaFieldMap {
	if (nodeChange.fieldChanges !== undefined) {
		return intoDeltaImpl(nodeChange.fieldChanges, change, fieldKinds);
	}
	// TODO: update the API to allow undefined to be returned here
	return new Map();
}

export function areDeltaEquivalent(
	change1: ModularChangeset,
	change2: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
): boolean {
	const normalized1 = normalizeChangeset(change1, fieldKinds, false, false, (chunk) => chunk);
	const normalized2 = normalizeChangeset(change2, fieldKinds, false, false, (chunk) => chunk);

	const delta1 = intoDelta(makeAnonChange(normalized1), fieldKinds);
	if (delta1.build !== undefined) {
		for (const build of delta1.build) {
			(build as Mutable<typeof build>).trees = makeDummyChunk(build.trees);
		}
	}

	if (delta1.refreshers !== undefined) {
		for (const build of delta1.refreshers) {
			(build as Mutable<typeof build>).trees = makeDummyChunk(build.trees);
		}
	}

	const delta2 = intoDelta(makeAnonChange(normalized2), fieldKinds);
	if (delta2.build !== undefined) {
		for (const build of delta2.build) {
			(build as Mutable<typeof build>).trees = makeDummyChunk(build.trees);
		}
	}

	if (delta2.refreshers !== undefined) {
		for (const build of delta2.refreshers) {
			(build as Mutable<typeof build>).trees = makeDummyChunk(build.trees);
		}
	}

	const diff = merge(delta1, delta2);
	if (hasConflict(diff)) {
		// Breakpoint here to inspect the diff
		return false;
	}
	return true;
}
