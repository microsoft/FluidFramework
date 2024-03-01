/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { UsageError } from "@fluidframework/telemetry-utils";
import { DoublyLinkedList } from "./collections/index.js";
import { EndOfTreeSegment } from "./endOfTreeSegment.js";
import { LocalReferenceCollection, LocalReferencePosition } from "./localReference.js";
import { IMergeTreeDeltaCallbackArgs } from "./mergeTreeDeltaCallback.js";
import { ISegmentLeaf, ISegment, toRemovalInfo } from "./mergeTreeNodes.js";
import { depthFirstNodeWalk } from "./mergeTreeNodeWalk.js";
import { ITrackingGroup, Trackable, UnorderedTrackingGroup } from "./mergeTreeTracking.js";
import { IJSONSegment, MergeTreeDeltaType, ReferenceType } from "./ops.js";
import { matchProperties, PropertySet } from "./properties.js";
import { DetachedReferencePosition } from "./referencePositions.js";
import { MergeTree, findRootMergeBlock } from "./mergeTree.js";

/**
 * @alpha
 */
export type MergeTreeDeltaRevertible =
	| {
			operation: typeof MergeTreeDeltaType.INSERT;
			trackingGroup: ITrackingGroup;
	  }
	| {
			operation: typeof MergeTreeDeltaType.REMOVE;
			trackingGroup: ITrackingGroup;
	  }
	| {
			operation: typeof MergeTreeDeltaType.ANNOTATE;
			trackingGroup: ITrackingGroup;
			propertyDeltas: PropertySet;
	  };

/**
 * Tests whether x is a MergeTreeDeltaRevertible
 * @internal
 */
export function isMergeTreeDeltaRevertible(x: unknown): x is MergeTreeDeltaRevertible {
	return !!x && typeof x === "object" && "operation" in x && "trackingGroup" in x;
}

type TypedRevertible<T extends MergeTreeDeltaRevertible["operation"]> = MergeTreeDeltaRevertible & {
	operation: T;
};

interface RemoveSegmentRefProperties {
	/**
	 * the serialized form of the segment, so it can be re-inserted
	 */
	segSpec: IJSONSegment;
	/**
	 * a tag  so the reference can be identified as being created for revert
	 */
	referenceSpace: "mergeTreeDeltaRevertible";
}

/**
 * @alpha
 */
export interface MergeTreeRevertibleDriver {
	insertFromSpec(pos: number, spec: IJSONSegment): void;
	removeRange(start: number, end: number): void;
	annotateRange(start: number, end: number, props: PropertySet): void;
}

/**
 * exported for test only. should not be exported out the the package
 * @internal
 */
export interface MergeTreeWithRevert extends MergeTree {
	__mergeTreeRevertible: {
		detachedReferences: EndOfTreeSegment;
		refCallbacks: LocalReferencePosition["callbacks"];
	};
}

export type PickPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
function findMergeTreeWithRevert(trackable: Trackable): MergeTreeWithRevert {
	const segmentOrNode = trackable.isLeaf() ? trackable : trackable.getSegment();
	const maybeRoot = findRootMergeBlock(segmentOrNode);
	assert(
		maybeRoot?.mergeTree !== undefined,
		0x5c2 /* trackable is invalid as it is not in a rooted merge tree. */,
	);
	const mergeTree: PickPartial<MergeTreeWithRevert, "__mergeTreeRevertible"> =
		maybeRoot.mergeTree;

	if (mergeTree.__mergeTreeRevertible === undefined) {
		const detachedReferences = new EndOfTreeSegment(maybeRoot.mergeTree);
		const refCallbacks: MergeTreeWithRevert["__mergeTreeRevertible"]["refCallbacks"] = {
			afterSlide: (r: LocalReferencePosition) => {
				if (mergeTree.referencePositionToLocalPosition(r) === DetachedReferencePosition) {
					const refs = LocalReferenceCollection.setOrGet(detachedReferences);
					refs.addAfterTombstones([r]);
				}
			},
		};
		mergeTree.__mergeTreeRevertible = {
			refCallbacks,
			detachedReferences,
		};
	}
	return mergeTree as MergeTreeWithRevert;
}

function appendLocalInsertToRevertibles(
	deltaArgs: IMergeTreeDeltaCallbackArgs,
	revertibles: MergeTreeDeltaRevertible[],
) {
	if (revertibles[revertibles.length - 1]?.operation !== MergeTreeDeltaType.INSERT) {
		revertibles.push({
			operation: MergeTreeDeltaType.INSERT,
			trackingGroup: new UnorderedTrackingGroup(),
		});
	}
	const last = revertibles[revertibles.length - 1];
	deltaArgs.deltaSegments.forEach((t) => last.trackingGroup.link(t.segment));

	return revertibles;
}

function appendLocalRemoveToRevertibles(
	deltaArgs: IMergeTreeDeltaCallbackArgs,
	revertibles: MergeTreeDeltaRevertible[],
) {
	if (revertibles[revertibles.length - 1]?.operation !== MergeTreeDeltaType.REMOVE) {
		revertibles.push({
			operation: MergeTreeDeltaType.REMOVE,
			trackingGroup: new UnorderedTrackingGroup(),
		});
	}
	const last = revertibles[revertibles.length - 1];

	const mergeTreeWithRevert = findMergeTreeWithRevert(deltaArgs.deltaSegments[0].segment);

	deltaArgs.deltaSegments.forEach((t) => {
		const props: RemoveSegmentRefProperties = {
			segSpec: t.segment.toJSONObject(),
			referenceSpace: "mergeTreeDeltaRevertible",
		};
		const ref = mergeTreeWithRevert.createLocalReferencePosition(
			t.segment,
			0,
			ReferenceType.SlideOnRemove,
			props,
		);
		ref.callbacks = mergeTreeWithRevert.__mergeTreeRevertible.refCallbacks;
		t.segment.trackingCollection.trackingGroups.forEach((tg) => {
			tg.link(ref);
			tg.unlink(t.segment);
		});

		last.trackingGroup.link(ref);
	});
	return revertibles;
}

function appendLocalAnnotateToRevertibles(
	deltaArgs: IMergeTreeDeltaCallbackArgs,
	revertibles: MergeTreeDeltaRevertible[],
) {
	let last = revertibles[revertibles.length - 1];
	deltaArgs.deltaSegments.forEach((ds) => {
		const propertyDeltas = ds.propertyDeltas;
		if (propertyDeltas) {
			if (
				last?.operation === MergeTreeDeltaType.ANNOTATE &&
				matchProperties(last?.propertyDeltas, propertyDeltas)
			) {
				last.trackingGroup.link(ds.segment);
			} else {
				last = {
					operation: MergeTreeDeltaType.ANNOTATE,
					propertyDeltas,
					trackingGroup: new UnorderedTrackingGroup(),
				};
				last.trackingGroup.link(ds.segment);
				revertibles.push(last);
			}
		}
	});
	return revertibles;
}

/**
 * @alpha
 */
export function appendToMergeTreeDeltaRevertibles(
	deltaArgs: IMergeTreeDeltaCallbackArgs,
	revertibles: MergeTreeDeltaRevertible[],
) {
	if (deltaArgs.deltaSegments.length === 0) {
		return;
	}
	switch (deltaArgs.operation) {
		case MergeTreeDeltaType.INSERT:
			appendLocalInsertToRevertibles(deltaArgs, revertibles);
			break;

		case MergeTreeDeltaType.REMOVE:
			appendLocalRemoveToRevertibles(deltaArgs, revertibles);
			break;

		case MergeTreeDeltaType.ANNOTATE:
			appendLocalAnnotateToRevertibles(deltaArgs, revertibles);
			break;

		default:
			throw new UsageError("Unsupported event delta type", {
				operation: deltaArgs.operation,
			});
	}
}

/**
 * @alpha
 */
export function discardMergeTreeDeltaRevertible(revertibles: MergeTreeDeltaRevertible[]) {
	revertibles.forEach((r) => {
		r.trackingGroup.tracked.forEach((t) => {
			t.trackingCollection.unlink(r.trackingGroup);
			// remove untracked local references
			if (t.trackingCollection.empty && !t.isLeaf()) {
				t.getSegment()?.localRefs?.removeLocalRef(t);
			}
		});
	});
}

function revertLocalInsert(
	driver: MergeTreeRevertibleDriver,
	mergeTreeWithRevert: MergeTreeWithRevert,
	revertible: TypedRevertible<typeof MergeTreeDeltaType.INSERT>,
) {
	while (revertible.trackingGroup.size > 0) {
		const tracked = revertible.trackingGroup.tracked[0];
		assert(
			tracked.trackingCollection.unlink(revertible.trackingGroup),
			0x3f1 /* tracking group removed */,
		);
		assert(tracked.isLeaf(), 0x3f2 /* inserts must track segments */);
		if (toRemovalInfo(tracked) === undefined) {
			const start = getPosition(mergeTreeWithRevert, tracked);
			driver.removeRange(start, start + tracked.cachedLength);
		}
	}
}

function revertLocalRemove(
	driver: MergeTreeRevertibleDriver,
	mergeTreeWithRevert: MergeTreeWithRevert,
	revertible: TypedRevertible<typeof MergeTreeDeltaType.REMOVE>,
) {
	while (revertible.trackingGroup.size > 0) {
		const tracked = revertible.trackingGroup.tracked[0];

		assert(
			tracked.trackingCollection.unlink(revertible.trackingGroup),
			0x3f3 /* tracking group removed */,
		);

		assert(!tracked.isLeaf(), 0x3f4 /* removes must track local refs */);

		const refSeg = tracked.getSegment();
		let realPos = mergeTreeWithRevert.referencePositionToLocalPosition(tracked);

		// References which are on EndOfStringSegment don't return detached for pos,
		// they will return the length of the merge-tree. this case just catches
		// random references, likely not created in the revertible flow,
		// that are tying to be reverted for some reason.
		if (realPos === DetachedReferencePosition || refSeg === undefined) {
			throw new UsageError("Cannot insert at detached references position");
		}

		if (toRemovalInfo(refSeg) === undefined && refSeg.localRefs?.isAfterTombstone(tracked)) {
			realPos++;
		}

		const props = tracked.properties as RemoveSegmentRefProperties;
		driver.insertFromSpec(realPos, props.segSpec);
		const insertSegment: ISegmentLeaf | undefined = mergeTreeWithRevert.getContainingSegment(
			realPos,
			mergeTreeWithRevert.collabWindow.currentSeq,
			mergeTreeWithRevert.collabWindow.clientId,
		).segment;
		assert(insertSegment !== undefined, 0x3f5 /* insert segment must exist at position */);

		const localSlideFilter = (lref: LocalReferencePosition) =>
			(lref.properties as Partial<RemoveSegmentRefProperties>)?.referenceSpace ===
			"mergeTreeDeltaRevertible";

		const insertRef: Partial<
			Record<"before" | "after", DoublyLinkedList<LocalReferencePosition>>
		> = {};
		const forward = insertSegment.ordinal < refSeg.ordinal;
		const refHandler = (lref: LocalReferencePosition) => {
			// once we reach it keep the original reference where it is
			// we'll move tracking groups, and remove it as a last step.
			if (tracked === lref) {
				return false;
			}
			if (localSlideFilter(lref)) {
				if (forward) {
					const before = (insertRef.before ??= new DoublyLinkedList());
					before.push(lref);
				} else {
					const after = (insertRef.after ??= new DoublyLinkedList());
					after.unshift(lref);
				}
			}
		};
		depthFirstNodeWalk(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			insertSegment.parent!,
			insertSegment,
			undefined,
			(seg) => {
				if (seg.localRefs?.empty === false) {
					return seg.localRefs.walkReferences(refHandler, undefined, forward);
				}
				return true;
			},
			undefined,
			forward,
		);
		if (
			mergeTreeWithRevert?.__mergeTreeRevertible?.detachedReferences?.localRefs?.has(tracked)
		) {
			assert(forward, 0x3f6 /* forward should always be true when detached */);
			mergeTreeWithRevert?.__mergeTreeRevertible.detachedReferences.localRefs.walkReferences(
				refHandler,
			);
		}

		if (insertRef !== undefined) {
			const localRefs = LocalReferenceCollection.setOrGet(insertSegment);
			if (insertRef.before?.empty === false) {
				localRefs.addBeforeTombstones(insertRef.before.map((n) => n.data));
			}
			if (insertRef.after?.empty === false) {
				localRefs.addAfterTombstones(insertRef.after.map((n) => n.data));
			}
		}

		tracked.trackingCollection.trackingGroups.forEach((tg) => {
			tg.link(insertSegment);
			tg.unlink(tracked);
		});
		tracked.getSegment()?.localRefs?.removeLocalRef(tracked);
	}
}

function revertLocalAnnotate(
	driver: MergeTreeRevertibleDriver,
	mergeTreeWithRevert: MergeTreeWithRevert,
	revertible: TypedRevertible<typeof MergeTreeDeltaType.ANNOTATE>,
) {
	while (revertible.trackingGroup.size > 0) {
		const tracked = revertible.trackingGroup.tracked[0];
		const unlinked = tracked.trackingCollection.unlink(revertible.trackingGroup);
		assert(unlinked && tracked.isLeaf(), 0x3f7 /* annotates must track segments */);
		if (toRemovalInfo(tracked) === undefined) {
			const start = getPosition(mergeTreeWithRevert, tracked);
			driver.annotateRange(start, start + tracked.cachedLength, revertible.propertyDeltas);
		}
	}
}

function getPosition(mergeTreeWithRevert: MergeTreeWithRevert, segment: ISegment) {
	return mergeTreeWithRevert.getPosition(
		segment,
		mergeTreeWithRevert.collabWindow.currentSeq,
		mergeTreeWithRevert.collabWindow.clientId,
	);
}

/**
 * @alpha
 */
export function revertMergeTreeDeltaRevertibles(
	driver: MergeTreeRevertibleDriver,
	revertibles: MergeTreeDeltaRevertible[],
) {
	let mergeTreeWithRevert: MergeTreeWithRevert | undefined;

	while (revertibles.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const r = revertibles.pop()!;
		const operation = r.operation;
		if (r.trackingGroup.size > 0) {
			mergeTreeWithRevert ??= findMergeTreeWithRevert(r.trackingGroup.tracked[0]);
			switch (operation) {
				case MergeTreeDeltaType.INSERT:
					revertLocalInsert(driver, mergeTreeWithRevert, r);
					break;
				case MergeTreeDeltaType.REMOVE:
					revertLocalRemove(driver, mergeTreeWithRevert, r);
					break;
				case MergeTreeDeltaType.ANNOTATE:
					revertLocalAnnotate(driver, mergeTreeWithRevert, r);
					break;
				default:
					unreachableCase(operation);
			}
		}
	}
}
