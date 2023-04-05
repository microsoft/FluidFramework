/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { UsageError } from "@fluidframework/container-utils";
import { List } from "./collections";
import { EndOfTreeSegment } from "./endOfTreeSegment";
import { LocalReferenceCollection, LocalReferencePosition } from "./localReference";
import { IMergeTreeDeltaCallbackArgs } from "./mergeTreeDeltaCallback";
import { ISegment, toRemovalInfo } from "./mergeTreeNodes";
import { depthFirstNodeWalk } from "./mergeTreeNodeWalk";
import { Trackable, TrackingGroup } from "./mergeTreeTracking";
import { IJSONSegment, MergeTreeDeltaType, ReferenceType } from "./ops";
import { matchProperties, PropertySet } from "./properties";
import { DetachedReferencePosition } from "./referencePositions";
import { MergeTree, findRootMergeBlock } from "./mergeTree";

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 *
 * @alpha
 */
export type MergeTreeDeltaRevertible =
	| {
			operation: typeof MergeTreeDeltaType.INSERT;
			trackingGroup: TrackingGroup;
	  }
	| {
			operation: typeof MergeTreeDeltaType.REMOVE;
			trackingGroup: TrackingGroup;
	  }
	| {
			operation: typeof MergeTreeDeltaType.ANNOTATE;
			trackingGroup: TrackingGroup;
			propertyDeltas: PropertySet;
	  };

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
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 *
 * @alpha
 */
export interface MergeTreeRevertibleDriver {
	insertFromSpec(pos: number, spec: IJSONSegment);
	removeRange(start: number, end: number);
	annotateRange(start: number, end: number, props: PropertySet);
	createLocalReferencePosition(
		segment: ISegment,
		offset: number,
		refType: ReferenceType,
		properties: PropertySet | undefined,
	): LocalReferencePosition;
	localReferencePositionToPosition(lref: LocalReferencePosition): number;
	getPosition(segment: ISegment): number;
	getContainingSegment(pos: number): {
		segment: ISegment | undefined;
		offset: number | undefined;
	};
}

/**
 * exported for test only. should not be exported out the the package
 * @internal
 */
export interface RevertRootMergeBlock {
	mergeTree: MergeTree;
	__mergeTreeRevertible: {
		detachedReferences: EndOfTreeSegment;
		refCallbacks: LocalReferencePosition["callbacks"];
	};
}

function findRevertRootMergeBlock(trackable: Trackable): RevertRootMergeBlock {
	const segmentOrNode = trackable.isLeaf() ? trackable : trackable.getSegment();
	const maybeRoot: Partial<RevertRootMergeBlock> | undefined = findRootMergeBlock(segmentOrNode);
	assert(maybeRoot?.mergeTree !== undefined, "foo");

	if (maybeRoot.__mergeTreeRevertible === undefined) {
		const detachedReferences = new EndOfTreeSegment(maybeRoot.mergeTree);
		const refCallbacks: RevertRootMergeBlock["__mergeTreeRevertible"]["refCallbacks"] = {
			afterSlide: (r: LocalReferencePosition) => {
				if (
					maybeRoot.mergeTree?.referencePositionToLocalPosition(r) ===
					DetachedReferencePosition
				) {
					const refs = (detachedReferences.localRefs ??= new LocalReferenceCollection(
						detachedReferences,
					));
					refs.addAfterTombstones([r]);
				}
			},
		};
		maybeRoot.__mergeTreeRevertible = {
			refCallbacks,
			detachedReferences,
		};
	}
	return maybeRoot as RevertRootMergeBlock;
}

function appendLocalInsertToRevertibles(
	deltaArgs: IMergeTreeDeltaCallbackArgs,
	revertibles: MergeTreeDeltaRevertible[],
) {
	if (revertibles[revertibles.length - 1]?.operation !== MergeTreeDeltaType.INSERT) {
		revertibles.push({
			operation: MergeTreeDeltaType.INSERT,
			trackingGroup: new TrackingGroup(),
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
			trackingGroup: new TrackingGroup(),
		});
	}
	const last = revertibles[revertibles.length - 1];

	const revertRoot = findRevertRootMergeBlock(deltaArgs.deltaSegments[0].segment);

	deltaArgs.deltaSegments.forEach((t) => {
		const props: RemoveSegmentRefProperties = {
			segSpec: t.segment.toJSONObject(),
			referenceSpace: "mergeTreeDeltaRevertible",
		};
		const ref = revertRoot.mergeTree.createLocalReferencePosition(
			t.segment,
			0,
			ReferenceType.SlideOnRemove,
			props,
		);
		ref.callbacks = revertRoot.__mergeTreeRevertible.refCallbacks;
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
					trackingGroup: new TrackingGroup(),
				};
				last.trackingGroup.link(ds.segment);
				revertibles.push(last);
			}
		}
	});
	return revertibles;
}

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 * @alpha
 */
export function appendToMergeTreeDeltaRevertibles(
	driver: MergeTreeRevertibleDriver | undefined,
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
			throw new UsageError(`Unsupported event delta type: ${deltaArgs.operation}`);
	}
}

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
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
	revertRoot: RevertRootMergeBlock,
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
			const start = getPosition(revertRoot, tracked);
			driver.removeRange(start, start + tracked.cachedLength);
		}
	}
}

function revertLocalRemove(
	driver: MergeTreeRevertibleDriver,
	revertRoot: RevertRootMergeBlock,
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
		let realPos = revertRoot.mergeTree.referencePositionToLocalPosition(tracked);

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
		const insertSegment = revertRoot.mergeTree.getContainingSegment(
			realPos,
			revertRoot.mergeTree.collabWindow.currentSeq,
			revertRoot.mergeTree.collabWindow.clientId,
		).segment;
		assert(insertSegment !== undefined, 0x3f5 /* insert segment must exist at position */);

		const localSlideFilter = (lref: LocalReferencePosition) =>
			(lref.properties as Partial<RemoveSegmentRefProperties>)?.referenceSpace ===
			"mergeTreeDeltaRevertible";

		const insertRef: Partial<Record<"before" | "after", List<LocalReferencePosition>>> = {};
		const forward = insertSegment.ordinal < refSeg.ordinal;
		const refHandler = (lref: LocalReferencePosition) => {
			// once we reach it keep the original reference where it is
			// we'll move tracking groups, and remove it as a last step.
			if (tracked === lref) {
				return false;
			}
			if (localSlideFilter(lref)) {
				if (forward) {
					const before = (insertRef.before ??= new List());
					before.push(lref);
				} else {
					const after = (insertRef.after ??= new List());
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
		if (revertRoot?.__mergeTreeRevertible?.detachedReferences?.localRefs?.has(tracked)) {
			assert(forward, 0x3f6 /* forward should always be true when detached */);
			revertRoot?.__mergeTreeRevertible.detachedReferences.localRefs.walkReferences(
				refHandler,
			);
		}

		if (insertRef !== undefined) {
			const localRefs = (insertSegment.localRefs ??= new LocalReferenceCollection(
				insertSegment,
			));
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
	revertRoot: RevertRootMergeBlock,
	revertible: TypedRevertible<typeof MergeTreeDeltaType.ANNOTATE>,
) {
	while (revertible.trackingGroup.size > 0) {
		const tracked = revertible.trackingGroup.tracked[0];
		const unlinked = tracked.trackingCollection.unlink(revertible.trackingGroup);
		assert(unlinked && tracked.isLeaf(), 0x3f7 /* annotates must track segments */);
		if (toRemovalInfo(tracked) === undefined) {
			const start = getPosition(revertRoot, tracked);
			driver.annotateRange(start, start + tracked.cachedLength, revertible.propertyDeltas);
		}
	}
}

function getPosition(revertRoot: RevertRootMergeBlock, segment: ISegment) {
	const mergeTree = revertRoot.mergeTree;
	return mergeTree.getPosition(
		segment,
		mergeTree.collabWindow.currentSeq,
		mergeTree.collabWindow.clientId,
	);
}

/**
 * Revertibles are new and require the option
 * mergeTreeUseNewLengthCalculations to be set as true on the underlying merge tree
 * in order to function correctly.
 * @alpha
 */
export function revertMergeTreeDeltaRevertibles(
	driver: MergeTreeRevertibleDriver,
	revertibles: MergeTreeDeltaRevertible[],
) {
	if (revertibles.length === 0) {
		return;
	}
	const revertRoot = findRevertRootMergeBlock(revertibles[0].trackingGroup.tracked[0]);

	while (revertibles.length > 0) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const r = revertibles.pop()!;
		const operation = r.operation;
		if (r.trackingGroup.size > 0) {
			switch (operation) {
				case MergeTreeDeltaType.INSERT:
					revertLocalInsert(driver, revertRoot, r);
					break;
				case MergeTreeDeltaType.REMOVE:
					revertLocalRemove(driver, revertRoot, r);
					break;
				case MergeTreeDeltaType.ANNOTATE:
					revertLocalAnnotate(driver, revertRoot, r);
					break;
				default:
					unreachableCase(operation);
			}
		}
	}
}
