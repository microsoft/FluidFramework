/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, isObject } from "@fluidframework/core-utils/internal";

import { UnassignedSequenceNumber } from "./constants.js";
import {
	ISegmentInternal,
	ISegmentPrivate,
	MergeBlock,
	type OperationTimestamp,
} from "./mergeTreeNodes.js";

export interface StringToType {
	"string": string;
	"number": number;
	"object": object;
	"array": [];
	"boolean": boolean;
}

export function propExists<P extends string>(
	thing: unknown,
	prop: P,
): thing is Record<P, unknown> {
	return isObject(thing) && prop in thing;
}

export function hasProp<P extends string, T extends keyof StringToType>(
	thing: unknown,
	prop: P,
	type: T,
): thing is Record<P, StringToType[typeof type]> {
	return (
		propExists(thing, prop) &&
		(type === "array" ? Array.isArray(thing[prop]) : typeof thing[prop] === type)
	);
}

export function propInstanceOf<P extends string, T>(
	thing: unknown,
	prop: P,
	type: new (...args: any[]) => T,
): thing is Record<P, T> {
	return propExists(thing, prop) && thing[prop] instanceof type;
}

/**
 * Contains insertion information associated to an {@link ISegment}.
 */
export interface IHasInsertionInfo {
	insert: OperationTimestamp;
	// /**
	//  * Short clientId for the client that inserted this segment.
	//  */
	// clientId: number;
	// /**
	//  * Local seq at which this segment was inserted.
	//  * This is defined if and only if the insertion of the segment is pending ack, i.e. `seq` is UnassignedSequenceNumber.
	//  * Once the segment is acked, this field is cleared.
	//  *
	//  * @privateRemarks
	//  * See {@link CollaborationWindow.localSeq} for more information on the semantics of localSeq.
	//  */
	// localSeq?: number;
	// /**
	//  * Seq at which this segment was inserted.
	//  * If undefined, it is assumed the segment was inserted prior to the collab window's minimum sequence number.
	//  */
	// seq: number;
}

/**
 * Converts a segment-like object to an insertion info object if possible.
 *
 * @param segmentLike - The segment-like object to convert.
 * @returns The insertion info object if the conversion is possible, otherwise undefined.
 */
export const toInsertionInfo = (segmentLike: unknown): IHasInsertionInfo | undefined => {
	const insert = (segmentLike as any)?.insert;

	return insert !== undefined &&
		hasProp(insert, "clientId", "number") &&
		hasProp(insert, "seq", "number")
		? (segmentLike as IHasInsertionInfo)
		: undefined;
};

/**
 * A type-guard which determines if the segment has insertion info, and
 * returns true if it does, along with applying strong typing.
 *
 * @param segmentLike - The segment-like object to check.
 * @returns True if the segment has insertion info, otherwise false.
 */
export const isInserted = (segmentLike: unknown): segmentLike is IHasInsertionInfo =>
	toInsertionInfo(segmentLike) !== undefined;

/**
 * Asserts that the segment has insertion info. Usage of this function should not produce a user facing error.
 *
 * @param segmentLike - The segment-like object to check.
 * @throws Will throw an error if the segment does not have insertion info.
 */
export const assertInserted: <T extends Partial<IHasInsertionInfo> | undefined>(
	segmentLike: ISegmentInternal | Partial<IHasInsertionInfo> | T,
) => asserts segmentLike is IHasInsertionInfo | Exclude<T, Partial<IHasInsertionInfo>> = (
	segmentLike,
) =>
	assert(
		segmentLike === undefined || isInserted(segmentLike),
		0xaa0 /* must be insertionInfo */,
	);

/**
 * Common properties for a node in a merge tree.
 */
export interface IMergeNodeInfo {
	/**
	 * The parent merge block if the node is parented
	 */
	parent: MergeBlock;

	/**
	 * The index of this node in its parent's list of children.
	 */
	index: number;

	/**
	 * A string that can be used for comparing the location of this node to other `MergeNode`s in the same tree.
	 * `a.ordinal < b.ordinal` if and only if `a` comes before `b` in a pre-order traversal of the tree.
	 */
	ordinal: string;
}

/**
 * Converts a segment-like object to a merge node info object if possible.
 *
 * @param segmentLike - The segment-like object to convert.
 * @returns The merge node info object if the conversion is possible, otherwise undefined.
 */
export const toMergeNodeInfo = (nodeLike: unknown): IMergeNodeInfo | undefined =>
	propInstanceOf(nodeLike, "parent", MergeBlock) &&
	hasProp(nodeLike, "ordinal", "string") &&
	hasProp(nodeLike, "index", "number")
		? nodeLike
		: undefined;

/**
 * A type-guard which determines if the segment has merge node info, and
 * returns true if it does, along with applying strong typing.
 *
 * @param nodeLike - The segment-like object to check.
 * @returns True if the segment has merge node info, otherwise false.
 */
export const isMergeNodeInfo = (nodeLike: unknown): nodeLike is IMergeNodeInfo =>
	toMergeNodeInfo(nodeLike) !== undefined;

/**
 * Asserts that the segment has merge node info. Usage of this function should not produce a user facing error.
 *
 * @param segmentLike - The segment-like object to check.
 * @throws Will throw an error if the segment does not have merge node info.
 */
export const assertMergeNode: <T extends Partial<IMergeNodeInfo> | undefined>(
	nodeLike: ISegmentInternal | ISegmentPrivate | Partial<IMergeNodeInfo> | T,
) => asserts nodeLike is IMergeNodeInfo | Exclude<T, Partial<IMergeNodeInfo>> = (
	segmentLike,
) =>
	assert(
		segmentLike === undefined || isMergeNodeInfo(segmentLike),
		0xaa1 /* must be MergeNodeInfo */,
	);

/**
 * Removes the merge node info. This is used to remove nodes from the merge-tree.
 * @param segmentLike - The segment-like object to check.
 * @returns This function will change the type of the provided node like to never via an assertion. This
 * ensures no further usage of the removed merge node info is allowed. if continued use is required other
 * type coercion methods should be used to correctly re-type the variable.
 */
export const removeMergeNodeInfo: (nodeLike: IMergeNodeInfo) => asserts nodeLike is never = (
	nodeLike,
) =>
	Object.assign<IMergeNodeInfo, Record<keyof IMergeNodeInfo, undefined>>(nodeLike, {
		parent: undefined,
		index: undefined,
		ordinal: undefined,
	});

export interface RemoveOperationTimestamp extends OperationTimestamp {
	type: "slice" | "set";
}

// TODO:
// - Document this, including moveDst or something like it.
// See old code in this file for continuity.
export interface IHasRemovalInfo {
	removes: RemoveOperationTimestamp[];
}

/**
 * Converts a segment-like object to a removal info object if possible.
 *
 * @param segmentLike - The segment-like object to convert.
 * @returns The removal info object if the conversion is possible, otherwise undefined.
 */
export const toRemovalInfo = (segmentLike: unknown): IHasRemovalInfo | undefined => {
	const removal = (segmentLike as any)?.removes;
	return removal !== undefined &&
		removal.length > 0 &&
		hasProp(removal[0], "clientId", "number") &&
		hasProp(removal[0], "seq", "number")
		? (segmentLike as IHasRemovalInfo)
		: undefined;
};

/**
 * A type-guard which determines if the segment has removal info, and
 * returns true if it does, along with applying strong typing.
 *
 * @param segmentLike - The segment-like object to check.
 * @returns True if the segment has removal info, otherwise false.
 */
// export const isRemoved = (segmentLike: unknown): segmentLike is IHasRemovalInfo =>
// 	toRemovalInfo(segmentLike) !== undefined;

export const isRemoved = (segmentLike: unknown): segmentLike is IHasRemovalInfo =>
	toRemovalInfo(segmentLike) !== undefined;

/**
 * Asserts that the segment has removal info. Usage of this function should not produce a user facing error.
 *
 * @param segmentLike - The segment-like object to check.
 * @throws Will throw an error if the segment does not have removal info.
 */
export const assertRemoved: <T extends Partial<IHasRemovalInfo> | undefined>(
	segmentLike: ISegmentInternal | Partial<IHasRemovalInfo> | T,
) => asserts segmentLike is IHasRemovalInfo | Exclude<T, Partial<IHasRemovalInfo>> = (
	segmentLike,
) =>
	assert(segmentLike === undefined || isRemoved(segmentLike), 0xaa2 /* must be removalInfo */);

/**
 * Removes the removal info. This is used in rollback.
 * @param segmentLike - The segment-like object to check.
 * @returns This function will change the type of the provided node like to never via an assertion. This
 * ensures no further usage of the removed removal info is allowed. if continued use is required other
 * type coercion methods should be use to correctly re-type the variable.
 */
export const removeRemovalInfo: (nodeLike: IHasRemovalInfo) => asserts nodeLike is never = (
	nodeLike,
) =>
	Object.assign<IHasRemovalInfo, Record<keyof IHasRemovalInfo, undefined>>(nodeLike, {
		removes: undefined,
	});

/**
 * Returns whether this segment was marked moved as soon as its insertion was acked.
 *
 * This can happen when an an insert occurs concurrent to an obliterate over the range the segment was inserted into,
 * and the obliterate was sequenced first.
 *
 * When this happens, the segment is only ever visible to the client that inserted the segment
 * (and only until that client has seen the obliterate which removed their segment).
 */
export function wasMovedOnInsert(segment: IHasInsertionInfo & ISegmentPrivate): boolean {
	const removeInfo = toRemovalInfo(segment);
	const movedSeq = removeInfo?.removes[0].seq;
	if (movedSeq === undefined || movedSeq === UnassignedSequenceNumber) {
		return false;
	}

	const insertSeq = segment.insert.seq;
	return insertSeq === UnassignedSequenceNumber || insertSeq > movedSeq;
}

/**
 * A union type representing any segment info.
 */
export type SegmentInfo = IMergeNodeInfo | IHasInsertionInfo | IHasRemovalInfo;

/**
 * A type representing a segment with additional info.
 */
export type SegmentWithInfo<
	T extends SegmentInfo,
	S extends ISegmentPrivate = ISegmentPrivate,
> = S & T;

/**
 * Overwrites the segment info on a segment-like object.
 *
 * @param segmentLike - The segment-like object to set the info on.
 * @param info - The segment info to overwrite.
 * @returns The segment-like object with the info set.
 */
export const overwriteInfo = <
	T extends SegmentInfo,
	S extends ISegmentPrivate = ISegmentPrivate,
>(
	segmentLike: S,
	info: T,
): SegmentWithInfo<T, S> => Object.assign(segmentLike, info);
