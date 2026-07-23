/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type {
	ChangeAtomId,
	ChangeAtomIdMap,
	ChangesetLocalId,
	DeltaFieldMap,
	DeltaRoot,
	FieldKindIdentifier,
	RevisionTag,
} from "../../core/index.js";
import { makeAnonChange } from "../../core/index.js";
import type { NestedSet } from "../../util/index.js";
import { addToNestedSet, brand, nestedSetContains, setInNestedMap } from "../../util/index.js";

import type { FlexFieldKind } from "./fieldKind.js";
import { computeMinimizedBuilds } from "./minimizeBuilds.js";
import { intoDelta } from "./modularChangeFamily.js";
import type { ModularChangeset } from "./modularChangeTypes.js";

/**
 * A set of node IDs, keyed by revision then by the numeric portion (`localId`/`minor`) of the ID.
 */
type ChangeAtomIdSet = NestedSet<RevisionTag | undefined, ChangesetLocalId>;

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

/**
 * Collects the set of node IDs whose content ends up attached within the live document tree
 * once the given change is applied.
 *
 * @remarks
 * These are the "used" nodes: any build whose nodes are not in this set has no observable
 * effect on the resulting document and can be dropped.
 */
function collectAttachedNodeIds(
	delta: DeltaRoot,
	globalById: ChangeAtomIdMap<DeltaFieldMap>,
): ChangeAtomIdSet {
	const attached: ChangeAtomIdSet = new Map();
	// Worklist of detached node IDs newly discovered to be live, whose own nested content must be visited.
	const worklist: ChangeAtomId[] = [];
	const markLive = (id: ChangeAtomId): void => {
		if (!nestedSetContains(attached, id.revision, id.localId)) {
			addToNestedSet(attached, id.revision, id.localId);
			worklist.push(id);
		}
	};

	const visitLiveFields = (fields: DeltaFieldMap | undefined): void => {
		if (fields === undefined) {
			return;
		}
		for (const field of fields.values()) {
			for (const mark of field.marks) {
				if (mark.attach !== undefined) {
					for (let offset = 0; offset < mark.count; offset += 1) {
						markLive({
							revision: mark.attach.major,
							localId: brand(mark.attach.minor + offset),
						});
					}
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

	// Process nodes discovered to be live: pull in their nested content (from `global`) and propagate
	// liveness backwards across renames (a node attached under its post-rename ID was built under its
	// pre-rename ID). Iterate to a fixed point.
	while (worklist.length > 0) {
		const next = worklist.pop();
		if (next === undefined) {
			break;
		}
		const { revision: major, localId: minor } = next;
		visitLiveFields(globalById.get(major)?.get(minor));
		if (delta.rename !== undefined) {
			for (const { oldId, newId, count } of delta.rename) {
				if (newId.major === major && minor >= newId.minor && minor < newId.minor + count) {
					markLive({
						revision: oldId.major,
						localId: brand(oldId.minor + (minor - newId.minor)),
					});
				}
			}
		}
	}

	return attached;
}

/**
 * "Minimizes" a {@link ModularChangeset} so that it contains no extraneous
 * information, i.e. no new content that isn't observable from document tree
 * and no edits without net observed effect on the document tree.
 *
 * @remarks
 * IMPORTANT: While this function has some implementation, it does not yet actually
 * make any changes to a given change.
 *
 * "Extraneous information" includes, for example, data for nodes that were both created and removed within the same
 * transaction, or changes whose effects cancel out to nothing. Minimizing reduces the size of an edit without altering
 * its observable effect.
 *
 * Every node created during the change contributes a `build`. Once the change is squashed, a build is only meaningful
 * for nodes that remain attached in the resulting document. This function inspects the change's
 * {@link intoDelta | delta} to determine which built nodes end up attached ("transient" nodes are those that do not),
 * then:
 *
 * - drops any build whose nodes are entirely unused, and splits any partially-used build so that only the runs of used
 * nodes are retained,
 * - trims transient content nested within a surviving node's build tree
 *
 * The result applies to produce the same document as the input change.
 *
 * @param change - The change to minimize. Not mutated by this function.
 * @param fieldKinds - The field kinds to delegate to when computing the change's delta.
 */
export function minimizeModularChangeset(
	change: ModularChangeset,
	fieldKinds: ReadonlyMap<FieldKindIdentifier, FlexFieldKind>,
	testOnlyArg_DisableBuildMinification: boolean = true,
): ModularChangeset {
	const builds = change.builds;
	if (builds === undefined || builds.size === 0) {
		return change;
	}

	assert(change.destroys === undefined, "No destroys expected in change to be minimized");

	const delta = intoDelta(makeAnonChange(change), fieldKinds);
	const globalById = indexGlobalById(delta);

	// Compute the set of detached node IDs whose content ends up attached in the resulting document. Content built by
	// this change but absent from this set has no observable effect and is treated as "dead" / trimmable below.
	const attached = collectAttachedNodeIds(delta, globalById);
	const isLive = ({ revision, localId }: ChangeAtomId): boolean =>
		// `|| true` (non-test default) effectively disables the minimization, which is
		// not viable without paired edit minimization that is not yet implemented.
		nestedSetContains(attached, revision, localId) || testOnlyArg_DisableBuildMinification;

	const minimizedChange = {
		...change,
	};

	const minimizedBuilds = computeMinimizedBuilds(builds, globalById, isLive);
	if (minimizedBuilds.size > 0) {
		minimizedChange.builds = minimizedBuilds;
	} else {
		delete minimizedChange.builds;
	}

	return minimizedChange;
}
