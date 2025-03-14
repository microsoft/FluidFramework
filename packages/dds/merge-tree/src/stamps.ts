/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnassignedSequenceNumber } from "./constants.js";

/**
 * A stamp that identifies provenance of an operation performed on the MergeTree.
 *
 * Stamps identify a point in time (`seq`/`localSeq`) as well as the source (`clientId`) for the operation.
 * This provides enough information to linearize all known applied operations: acked operations happen before
 * local+unacked ones, with acked operations ordered by their sequence numbers and local+unacked operations
 * ordered by their localSeq.
 *
 * By including `clientId`, it also provides enough information to resolve whether segments are visible
 * from alternative perspectives: a remote client will have seen all of its own previous operations as well as
 * those at or below the op's reference sequence number.
 *
 * @remarks - As the `readonly` identifies suggest, these stamps should be treated as immutable.
 * New operations applied to a merge-tree should create new stamps rather than modify existing ones (e.g. when
 * a change's ack happens).
 * @internal
 */
export interface OperationStamp {
	/**
	 * The sequence number at which this operation was applied.
	 */
	readonly seq: number;

	/**
	 * Short clientId for the client that performed this operation.
	 */
	readonly clientId: number;

	/**
	 * Local seq at which this operation was applied.
	 * This is defined if and only if the operation is pending an ack, i.e. `seq` is UnassignedSequenceNumber.
	 *
	 * @privateRemarks
	 * See {@link CollaborationWindow.localSeq} for more information on the semantics of localSeq.
	 */
	readonly localSeq?: number;
}

/**
 * {@link OperationStamp} for an 'insert' operation.
 */
export interface InsertOperationStamp extends OperationStamp {
	readonly type: "insert";
}

/**
 * {@link OperationStamp} for a 'set remove' operation. This aligns with the `markRangeRemoved` API in MergeTree.
 *
 * @remarks The terminology here comes from the fact that the removal should affect only the *set* of nodes that were
 * specified at the time the local client issued the remove, and not any nodes that were inserted concurrently.
 *
 * Not using "remove" and "obliterate" here allows us to unambiguously use the term "remove" elsewhere in code to mean
 * "removed from the tree, either by MergeTree.obliterateRange or MergeTree.removeRange". This is convenient as the vast majority
 * of merge-tree code only cares about segment visibility and not the specific operation that caused a segment to be removed.
 */
export interface SetRemoveOperationStamp extends OperationStamp {
	readonly type: "setRemove";
}

/**
 * {@link OperationStamp} for a 'set remove' operation. This aligns with the `obliterateRange` API in MergeTree.
 *
 * @remarks The terminology here comes from the fact that the removal should affect the *slice* of nodes between the
 * start and end point specified by the local client, which includes any nodes that were inserted concurrently.
 *
 * Not using "remove" and "obliterate" here allows us to unambiguously use the term "remove" elsewhere in code to mean
 * "removed from the tree, either by MergeTree.obliterateRange or MergeTree.removeRange". This is convenient as the vast majority
 * of merge-tree code only cares about segment visibility and not the specific operation that caused a segment to be removed.
 */
export interface SliceRemoveOperationStamp extends OperationStamp {
	readonly type: "sliceRemove";
}

export type RemoveOperationStamp = SetRemoveOperationStamp | SliceRemoveOperationStamp;

export function lessThan(a: OperationStamp, b: OperationStamp): boolean {
	if (a.seq === UnassignedSequenceNumber) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return b.seq === UnassignedSequenceNumber && a.localSeq! < b.localSeq!;
	}

	if (b.seq === UnassignedSequenceNumber) {
		return true;
	}

	return a.seq < b.seq;
}

export function gte(a: OperationStamp, b: OperationStamp): boolean {
	return !lessThan(a, b);
}

export function greaterThan(a: OperationStamp, b: OperationStamp): boolean {
	if (a.seq === UnassignedSequenceNumber) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return b.seq !== UnassignedSequenceNumber || a.localSeq! > b.localSeq!;
	}

	if (b.seq === UnassignedSequenceNumber) {
		return false;
	}

	return a.seq > b.seq;
}

export function lte(a: OperationStamp, b: OperationStamp): boolean {
	return !greaterThan(a, b);
}

export function equal(a: OperationStamp, b: OperationStamp): boolean {
	return a.seq === b.seq && a.clientId === b.clientId && a.localSeq === b.localSeq;
}

export function isLocal(a: OperationStamp): boolean {
	return a.seq === UnassignedSequenceNumber;
}

export function isAcked(a: OperationStamp): boolean {
	return a.seq !== UnassignedSequenceNumber;
}

/**
 * Inserts a stamp into a sorted list of stamps in the correct (sorted) position.
 *
 * Beware that this uses Array.splice, thus requires asymptotics considerations.
 * If inserting a variable number of timestamp, consider just pushing them and sorting the list
 * after using {@link compare} instead.
 */
export function spliceIntoList(list: OperationStamp[], stamp: OperationStamp): void {
	if (isLocal(stamp) || list.length === 0) {
		list.push(stamp);
	} else {
		for (let i = list.length - 1; i >= 0; i--) {
			if (greaterThan(stamp, list[i])) {
				list.splice(i + 1, 0, stamp);
				return;
			}
		}

		// Less than all stamps in the list: put it at the beginning.
		list.unshift(stamp);
	}
}

export function hasAnyAckedOperation(list: OperationStamp[]): boolean {
	return list.some((ts) => isAcked(ts));
}

export function compare(a: OperationStamp, b: OperationStamp): number {
	if (greaterThan(a, b)) {
		return 1;
	} else if (lessThan(a, b)) {
		return -1;
	} else {
		return 0;
	}
}
