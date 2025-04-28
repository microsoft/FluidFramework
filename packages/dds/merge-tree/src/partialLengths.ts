/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { MergeTree } from "./mergeTree.js";
import {
	CollaborationWindow,
	getMinSeqStamp,
	IMergeNode,
	ISegmentPrivate,
	type MergeBlock,
} from "./mergeTreeNodes.js";
import {
	LocalDefaultPerspective,
	LocalReconnectingPerspective,
	PriorPerspective,
} from "./perspective.js";
import { toRemovalInfo, assertInserted, wasRemovedOnInsert } from "./segmentInfos.js";
import { SortedSet } from "./sortedSet.js";
import * as opstampUtils from "./stamps.js";

class PartialSequenceLengthsSet extends SortedSet<PartialSequenceLength> {
	protected compare(a: PartialSequenceLength, b: PartialSequenceLength): number {
		return a.seq - b.seq;
	}

	public addOrUpdate(
		newItem: PartialSequenceLength,
		update?: (existingItem: PartialSequenceLength, newItem: PartialSequenceLength) => void,
	): void {
		if (newItem.seglen === 0) {
			// Don't bother doing any updates for deltas of 0.
			return;
		}
		const prev = this.latestLeq(newItem.seq);

		if (prev?.seq !== newItem.seq) {
			// new element, update len
			newItem.len = (prev?.len ?? 0) + newItem.seglen;
		}

		// update the len of all following elements
		for (let i = this.sortedItems.length - 1; i >= 0; i--) {
			const element = this.sortedItems[i];
			if (!element || element.seq <= newItem.seq) {
				break;
			}

			element.len += newItem.seglen;
		}

		super.addOrUpdate(newItem, (currentPartial, partialLength) => {
			assert(
				partialLength.clientId === currentPartial.clientId,
				0xab6 /* clientId mismatch */,
			);
			currentPartial.seglen += partialLength.seglen;
			currentPartial.len += partialLength.seglen;
		});
	}

	/**
	 * Returns the partial length whose sequence number is the greatest sequence
	 * number that is less than or equal to key.
	 * @param key - sequence number
	 */
	latestLeq(key: number): PartialSequenceLength | undefined {
		return this.sortedItems[this.latestLeqIndex(key)];
	}

	/**
	 * Returns the partial length whose sequence number is the lowest sequence
	 * number that is greater than or equal to key.
	 * @param key - sequence number
	 */
	firstGte(key: number): PartialSequenceLength | undefined {
		const { index } = this.findItemPosition({ seq: key, len: 0, seglen: 0 });
		return this.sortedItems[index];
	}

	private latestLeqIndex(key: number): number {
		const { exists, index } = this.findItemPosition({ seq: key, len: 0, seglen: 0 });
		return exists ? index : index - 1;
	}

	copyDown(minSeq: number): number {
		const mindex = this.latestLeqIndex(minSeq);
		let minLength = 0;
		if (mindex >= 0) {
			minLength = this.sortedItems[mindex].len;
			const seqCount = this.size;
			if (mindex <= seqCount - 1) {
				// Still some entries remaining
				const remainingCount = seqCount - mindex - 1;
				// Copy down
				for (let i = 0; i < remainingCount; i++) {
					this.sortedItems[i] = this.sortedItems[i + mindex + 1];
					this.sortedItems[i].len -= minLength;
				}
				this.sortedItems.length = remainingCount;
			}
		}
		return minLength;
	}
}

/**
 * Tracks length information for a part of a MergeTree (block) at a given time (seq).
 * These objects are associated with internal nodes (i.e. blocks).
 */
export interface PartialSequenceLength {
	/**
	 * Sequence number
	 */
	seq: number;
	/**
	 * The length of the associated block.
	 */
	len: number;
	/**
	 * The delta between the current length of the associated block and its length at the previous seq number.
	 */
	seglen: number;
	/**
	 * clientId for the client that submitted the op with sequence number `seq`.
	 */
	clientId?: number;
}

interface UnsequencedPartialLengthInfo {
	/**
	 * Contains entries for all local operations.
	 * The "seq" field of each entry actually corresponds to the delta at that localSeq on the local client.
	 *
	 * The length entries in this set are analogous to `PartialSequenceLengths.partialLengths` in that they represent the delta over the min seq
	 * that an observer client would see if they were to observe the local client's edits performed from the minSeq.
	 */
	partialLengths: PartialSequenceLengthsSet;

	/**
	 * Like PerClientAdjustments, except we store one set of PartialSequenceLengthsSet for each refSeq. The "seq" keys in these sets
	 * are all local seqs.
	 *
	 * These entries are aggregated by {@link PartialSequenceLengths.computeOverallRefSeqAdjustment} when a local perspective for a
	 * given refSeq is requested.
	 *
	 * In general, adjustments in this map are added to avoid double-counting an operation performed by both the local client and some
	 * remote client, and an adjustment at (refSeq = A, clientSeq = B) takes effect for all perspectives (refSeq = C, clientSeq = D) where
	 * A \<= C and B \<= D.
	 */
	perRefSeqAdjustments: Map<number, PartialSequenceLengthsSet>;

	/**
	 * Cache keyed on refSeq which stores length information for the total overlap of removed segments at
	 * that refSeq.
	 * This information is derivable from the entries of `perRefSeqAdjustments`.
	 *
	 * Like the `partialLengths` field, `seq` on each entry is actually the local seq.
	 * See `computeOverallRefSeqAdjustment` for more information.
	 */
	cachedAdjustmentByRefSeq: Map<number, PartialSequenceLengthsSet>;
}

export interface PartialSequenceLengthsOptions {
	verifier?: (partialLengths: PartialSequenceLengths) => void;
	verifyExpected?: (
		mergeTree: MergeTree,
		node: MergeBlock,
		refSeq: number,
		clientId: number,
		localSeq?: number,
	) => void;
	zamboni: boolean;
}

/**
 * Keeps track of partial sums of segment lengths for all sequence numbers in the current collaboration window.
 * Only used during active collaboration.
 *
 * This class is associated with an internal node (block) of a MergeTree. It efficiently answers queries of the form
 * "What is the length of `block` from the perspective of some particular seq and clientId?".
 *
 * It also supports incremental updating of state for newly-sequenced ops that don't affect the structure of the
 * MergeTree (in most cases--see AB#31003 or comments on {@link PartialSequenceLengths.update}).
 *
 * To answer these queries, it pre-builds several lists which track the length of the block at a per-sequence-number
 * level. These lists are:
 *
 * 1. (`partialLengths`): Stores the total length of the block.
 * 2. (`perClientAdjustments[clientId]`): Stores adjustments to the base length which account for all changes submitted by `clientId`. [see footnote]
 *
 * The reason both lists are necessary is that resolving the length of the block from the perspective of
 * (clientId, refSeq) requires including both of the following types of segments:
 * 1. Segments sequenced before `refSeq`
 * 2. Segments submitted by `clientId`
 *
 * This is possible with the above bookkeeping, using:
 *
 * (length of the block at the minimum sequence number)
 * + (partialLengths total length at refSeq)
 * + (clientSeqNumbers total length at most recent op)
 * - (clientSeqNumbers total length at refSeq)
 *
 * where the subtraction avoids double-counting segments submitted by clientId sequenced within the collab window.
 *
 * To enable reconnect, if constructed with `computeLocalPartials === true` it also supports querying for the length of
 * the block from the perspective of the local client at a particular `refSeq` and `localSeq`. This computation is
 * similar to the above:
 *
 * (length of the block at the minimum sequence number)
 * + (partialLengths total length at refSeq)
 * + (unsequenced edits' total length submitted before localSeq)
 * + (adjustments for changes double-counted by happening at or before both localSeq and refSeq)
 *
 * This algorithm scales roughly linearly with number of editing clients and the size of the collab window.
 * (certain unlikely sequences of operations may introduce log factors on those variables)
 *
 * @privateRemarks
 * If you are looking to understand this class in more detail, a suggested order of internalization is:
 *
 * 1. The above description and how it relates to the implementation of `getPartialLength` (which implements the above high-level description
 * 2. `PartialSequenceLengthsSet`, which allows binary searching for overall length deltas at a given sequence number and handles updates.
 * 3. The `fromLeaves` method, which is the base case for the [potential] recursion in `combine`
 * 4. The logic in `combine` to aggregate smaller block entries into larger ones
 * 5. The incremental code path of `update`
 */
export class PartialSequenceLengths {
	public static options: PartialSequenceLengthsOptions = {
		zamboni: true,
	};

	/**
	 * Length of the block this PartialSequenceLength corresponds to when viewed at `minSeq`.
	 */
	private minLength = 0;

	/**
	 * Total number of segments in the subtree rooted at the block this PartialSequenceLength corresponds to.
	 */
	private segmentCount = 0;

	/**
	 * List of PartialSequenceLength objects--ordered by increasing seq--giving length information about
	 * the block associated with this PartialSequenceLengths object.
	 *
	 * `minLength + partialLengths[i].len` gives the length of this block when considering the perspective of an observer
	 * client who has received edits up to (and including) sequence number `i`.
	 */
	private readonly partialLengths: PartialSequenceLengthsSet = new PartialSequenceLengthsSet();

	/**
	 * perClientAdjustments[clientId] contains a PartialSequenceLengthsSet of adjustments to the observer client's
	 * perspective (see {@link PartialSequenceLengths.partialLengths}) necessary to account for changes made by
	 * that client.
	 *
	 * As per doc comment on {@link PartialSequenceLengths}, the overall adjustment performed for the perspective of
	 * (clientId, refSeq) is given by the sum of length deltas in `perClientAdjustments[clientId]`
	 * for all sequence numbers S such that S \>= refSeq.
	 *
	 * (since these are ordered by sequence number and we cache cumulative sums, this is implemented using two lookups and a subtraction).
	 *
	 * The specific adjustments are roughly categorized as follows:
	 *
	 * - Ops submitted by a given client generally receive a partial lengths entry corresponding to their sequence number.
	 * e.g. insert of "ABC" at seq 5 will have a per-client adjustment entry of \{ seq: 5, seglen: 3 \}.
	 *
	 * - When client A deletes a segment concurrently with client B and loses the race (B's delete is sequenced first),
	 * A's per-client adjustments will contain an entry with a negative `seglen` corresponding to the length of the segment
	 * and a sequence number corresponding to that of B's delete. It will *not* receive a per-client adjustment for its own delete.
	 * This ensures that for perspectives (A, refSeq), the deleted segment will show up as a negative delta for all values of refSeq, since:
	 * 1. For refSeq \< B's delete, the per-client adjustment will apply and be added to the total length
	 * 2. For refSeq \>= B's delete, B's partial length entry in the overall set will apply, and the per-client adjustment will not apply
	 *
	 * - When client A attempts to insert a segment into a location that is concurrently obliterated by client B immediately upon insertion,
	 * A's per-client adjustments will again not include an entry for its own insert.
	 * Instead, the entry which would normally contain `seq` equal to that of A's insert would instead have `seq` equal to that of B's obliterate.
	 * This gives the overall correct behavior: for any perspective which isn't client A, there is no adjustment necessary anywhere (it's as if
	 * the segment never existed). For client A's perspective, the segment should be considered visible until A has acked B's obliterate.
	 * This is accomplished as for the perspective (A, refSeq):
	 * 1. For refSeq \< B's obliterate, the segment length will be included as part of the per-client adjustment for A
	 * 2. For refSeq \>= B's obliterate, the segment will be omitted from the per-client adjustment for A
	 *
	 * Note that the special-casing for inserting segments that are immediately obliterated is only necessary for segments that never were visible
	 * in the tree. If an insert and obliterate are concurrent but the insert is sequenced first, the normal per-client adjustment is fine.
	 *
	 * The second case (overlapping removal) applies to any combination of remove / obliterate operations.
	 */
	private readonly perClientAdjustments: PartialSequenceLengthsSet[] = [];

	/**
	 * Contains information required to answer queries for the length of this segment from the perspective of
	 * the local client but not including all local segments (i.e., `localSeq !== collabWindow.localSeq`).
	 * This field is only computed if requested in the constructor (i.e. `computeLocalPartials === true`).
	 *
	 * Note that the usage pattern for this list is a bit different from perClientAdjustments: when dealing with perspectives of remote clients,
	 * we generally want to know what their view of the block was accounting for all changes made by that client as well as all \<= some refSeq.
	 *
	 * However, when dealing with perspectives relevant to the local client, we are still interested in changes made \<= some refSeq, but instead
	 * of caring about all changes made by the local client, we additionally want the subset of them that were made \<= some localSeq.
	 *
	 * The PartialSequenceLengthsSets stored in this field therefore track localSeqs rather than seqs (it's still named seq for ease of implementation).
	 * Furthermore, when computing the length of the block at a given refSeq/localSeq perspective,
	 * rather than add something like `perClientAdjustments[clientId].latestLeq(latestSeq) - perClientAdjustments[clientId].latestLeq(refSeq)` [to
	 * get the tail end of adjustments necessary for a remote client client], we instead add `unsequencedRecords.partialLengths.latestLeq(localSeq)`
	 * [to get the head end of adjustments necessary for the local client].
	 */
	private unsequencedRecords: UnsequencedPartialLengthInfo | undefined;

	constructor(
		/**
		 * The minimumSequenceNumber as defined by the collab window used in the last call to `update`,
		 * or if no such calls have been made, the one used on construction.
		 */
		public minSeq: number,
		computeLocalPartials: boolean,
	) {
		if (computeLocalPartials) {
			this.unsequencedRecords = {
				partialLengths: new PartialSequenceLengthsSet(),
				perRefSeqAdjustments: new Map(),
				cachedAdjustmentByRefSeq: new Map(),
			};
		}
	}

	/**
	 * Combine the partial lengths of block's children
	 * @param block - an interior node. If `recur` is false, it is assumed that each interior node child of this block
	 * has its partials up to date.
	 * @param collabWindow - segment window of the segment tree containing `block`.
	 * @param recur - whether to recursively compute partial lengths for internal children of `block`.
	 * This incurs more work, but gives correct bookkeeping in the case that a descendant in the merge tree has been
	 * modified without bubbling up the resulting partial length change to this block's partials.
	 * @param computeLocalPartials - whether to compute partial length information about local unsequenced ops.
	 * This enables querying for the length of the block at a given localSeq, but incurs extra work.
	 * Local partial information doesn't support `update`.
	 */
	public static combine(
		block: MergeBlock,
		collabWindow: CollaborationWindow,
		recur = false,
		computeLocalPartials = false,
	): PartialSequenceLengths {
		const leafPartialLengths = PartialSequenceLengths.fromLeaves(
			block,
			collabWindow,
			computeLocalPartials,
		);

		let hasInternalChild = false;
		const childPartials: PartialSequenceLengths[] = [];
		for (let i = 0; i < block.childCount; i++) {
			const child = block.children[i];
			if (!child.isLeaf()) {
				hasInternalChild = true;
				if (recur) {
					child.partialLengths = PartialSequenceLengths.combine(
						child,
						collabWindow,
						true,
						computeLocalPartials,
					);
				}
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				childPartials.push(child.partialLengths!);
			}
		}

		// If there are no internal children, the PartialSequenceLengths returns from `fromLeaves` is exactly correct.
		// Otherwise, we must additively combine all of the children partial lengths to get this block's totals.
		const combinedPartialLengths = hasInternalChild
			? new PartialSequenceLengths(collabWindow.minSeq, computeLocalPartials)
			: leafPartialLengths;
		if (hasInternalChild) {
			if (leafPartialLengths.partialLengths.size > 0) {
				// Some children were leaves; add combined partials from these segments
				childPartials.push(leafPartialLengths);
			}

			const childPartialsLen = childPartials.length;

			const childPartialLengths: PartialSequenceLength[][] = [];
			const childUnsequencedPartialLengths: PartialSequenceLength[][] = [];
			const childPerRefSeqAdjustments: Map<number, PartialSequenceLengthsSet>[] = [];
			for (let i = 0; i < childPartialsLen; i++) {
				const { segmentCount, minLength, partialLengths, unsequencedRecords } =
					childPartials[i];
				combinedPartialLengths.segmentCount += segmentCount;
				combinedPartialLengths.minLength += minLength;
				childPartialLengths.push(partialLengths.items as PartialSequenceLength[]);
				if (unsequencedRecords) {
					childUnsequencedPartialLengths.push(
						unsequencedRecords.partialLengths.items as PartialSequenceLength[],
					);
					childPerRefSeqAdjustments.push(unsequencedRecords.perRefSeqAdjustments);
				}
			}

			mergePartialLengths(childPartialLengths, combinedPartialLengths.partialLengths);

			if (computeLocalPartials) {
				combinedPartialLengths.unsequencedRecords = {
					partialLengths: mergePartialLengths(childUnsequencedPartialLengths),
					cachedAdjustmentByRefSeq: new Map(),
					perRefSeqAdjustments: new Map(),
				};

				for (const perRefSeq of childPerRefSeqAdjustments) {
					for (const [refSeq, partials] of perRefSeq) {
						let combinedPartials =
							combinedPartialLengths.unsequencedRecords.perRefSeqAdjustments.get(refSeq);
						if (combinedPartials === undefined) {
							combinedPartials = new PartialSequenceLengthsSet();
							combinedPartialLengths.unsequencedRecords.perRefSeqAdjustments.set(
								refSeq,
								combinedPartials,
							);
						}
						for (const item of partials.items) {
							combinedPartials.addOrUpdate({ ...item });
						}
					}
				}
			}

			// could merge these like we do above rather than do out of order like this
			for (let i = 0; i < childPartialsLen; i++) {
				const { perClientAdjustments } = childPartials[i];
				if (perClientAdjustments.length > 0) {
					for (let clientId = 0; clientId < perClientAdjustments.length; clientId++) {
						const clientAdjustment = perClientAdjustments[clientId];
						if (clientAdjustment === undefined) {
							continue;
						}

						for (const partial of perClientAdjustments[clientId].items) {
							combinedPartialLengths.addClientAdjustment(
								clientId,
								partial.seq,
								partial.seglen,
							);
						}
					}
				}
			}
		}
		// TODO: incremental zamboni during build
		if (PartialSequenceLengths.options.zamboni) {
			combinedPartialLengths.zamboni(collabWindow);
		}

		PartialSequenceLengths.options.verifier?.(combinedPartialLengths);
		return combinedPartialLengths;
	}

	/**
	 * Create a `PartialSequenceLengths` which tracks only changes incurred by direct child leaves of `block`.
	 */
	private static fromLeaves(
		block: MergeBlock,

		collabWindow: CollaborationWindow,
		computeLocalPartials: boolean,
		retry = true,
	): PartialSequenceLengths {
		const combinedPartialLengths = new PartialSequenceLengths(
			collabWindow.minSeq,
			computeLocalPartials,
		);
		combinedPartialLengths.segmentCount = block.childCount;

		for (let i = 0; i < block.childCount; i++) {
			const child = block.children[i];
			if (child.isLeaf()) {
				// Leaf segment
				const segment = child;
				if (wasRemovedOnInsert(segment)) {
					PartialSequenceLengths.accountForRemoveOnInsert(
						combinedPartialLengths,
						segment,
						collabWindow,
					);
				} else {
					PartialSequenceLengths.accountForInsertion(
						combinedPartialLengths,
						segment,
						collabWindow,
					);

					PartialSequenceLengths.accountForRemoval(
						combinedPartialLengths,
						segment,
						collabWindow,
					);
				}
			}
		}

		PartialSequenceLengths.options.verifier?.(combinedPartialLengths);
		return combinedPartialLengths;
	}

	/**
	 * Assuming this segment was removed on insertion, inserts length information about that operation
	 * into the appropriate per-client adjustments (the overall view needs no such adjustment since
	 * from an observing client's perspective, the segment never exists).
	 */
	private static accountForRemoveOnInsert(
		combinedPartialLengths: PartialSequenceLengths,
		segment: ISegmentPrivate,
		collabWindow: CollaborationWindow,
	): void {
		assertInserted(segment);
		const removeInfo = toRemovalInfo(segment);
		assert(
			removeInfo !== undefined && wasRemovedOnInsert(segment),
			0xab7 /* Segment was not removed on insert */,
		);
		const firstRemove = removeInfo?.removes[0];
		if (opstampUtils.lte(firstRemove, getMinSeqStamp(collabWindow))) {
			// This segment was obliterated as soon as it was inserted, and everyone was aware of the obliterate.
			// Thus every single client treats this segment as length 0 from every perspective, and no adjustments
			// are necessary.
			return;
		}

		const { insert, cachedLength } = segment;
		const isLocal = opstampUtils.isLocal(insert);
		const { clientId } = insert;

		const partials = isLocal
			? combinedPartialLengths.unsequencedRecords?.partialLengths
			: combinedPartialLengths.partialLengths;
		if (partials === undefined) {
			// Local partial but its computation isn't required
			return;
		}

		if (isLocal) {
			// Implication -> this is a local segment which will be obliterated as soon as it is acked.
			// For refSeqs preceding that removedSeq and localSeqs following the localSeq, it will be visible.
			// For the rest, it will not be visible.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const localSeq = insert.localSeq!;
			partials.addOrUpdate({
				seq: localSeq,
				len: 0,
				seglen: cachedLength,
				clientId,
			});

			combinedPartialLengths.addLocalAdjustment({
				refSeq: firstRemove.seq,
				localSeq,
				seglen: -cachedLength,
			});

			const lastRemove = removeInfo.removes[removeInfo.removes.length - 1];
			if (opstampUtils.isLocal(lastRemove)) {
				// In addition to a remote sliceRemove causing this segment to be removed as soon as its insertion is acked,
				// the local client has also removed it before its insertion was acked.
				// It will therefore not be visible for a local reconnecting perspective beyond the removed localSeq.
				partials.addOrUpdate({
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					seq: lastRemove.localSeq!,
					len: 0,
					seglen: -cachedLength,
					clientId,
				});

				combinedPartialLengths.addLocalAdjustment({
					refSeq: firstRemove.seq,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					localSeq: lastRemove.localSeq!,
					seglen: cachedLength,
				});
			}
		} else {
			// Segment was obliterated on insert. Generally this means it should be visible only to the
			// inserting client (in which case we add an adjustment to only that client's perspective),
			// but if that client has also removed it, we don't need to add anything.
			const wasRemovedByInsertingClient =
				removeInfo !== undefined &&
				removeInfo.removes.some((remove) => remove.clientId === clientId);

			if (!wasRemovedByInsertingClient) {
				const removeSeq = firstRemove?.seq;
				assert(
					removeSeq !== undefined,
					0xab8 /* ObliterateOnInsertion implies removeSeq is defined */,
				);
				combinedPartialLengths.addClientAdjustment(clientId, removeSeq, cachedLength);
			}
		}
	}

	/**
	 * Inserts length information about the insertion of `segment` into
	 * `combinedPartialLengths.partialLengths` and the appropriate per-client adjustments.
	 */
	private static accountForInsertion(
		combinedPartialLengths: PartialSequenceLengths,
		segment: ISegmentPrivate,
		collabWindow: CollaborationWindow,
	): void {
		assertInserted(segment);
		if (opstampUtils.lte(segment.insert, getMinSeqStamp(collabWindow))) {
			combinedPartialLengths.minLength += segment.cachedLength;
			return;
		}

		const { insert, cachedLength: segmentLen } = segment;

		const isLocal = opstampUtils.isLocal(insert);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const seqOrLocalSeq = isLocal ? insert.localSeq! : insert.seq;
		const clientId = insert.clientId;

		const partials = isLocal
			? combinedPartialLengths.unsequencedRecords?.partialLengths
			: combinedPartialLengths.partialLengths;
		if (!partials) {
			// Local partial but its computation isn't required
			return;
		}

		if (isLocal) {
			partials.addOrUpdate({
				seq: seqOrLocalSeq,
				clientId,
				len: 0,
				seglen: segmentLen,
			});
		} else {
			partials.addOrUpdate({
				seq: seqOrLocalSeq,
				clientId,
				len: 0,
				seglen: segmentLen,
			});
			combinedPartialLengths.addClientAdjustment(clientId, seqOrLocalSeq, segmentLen);
		}
	}

	/**
	 * Inserts length information about the removal or obliteration of `segment` into
	 * `combinedPartialLengths.partialLengths` and the appropriate per-client adjustments.
	 */
	private static accountForRemoval(
		combinedPartialLengths: PartialSequenceLengths,
		segment: ISegmentPrivate,
		collabWindow: CollaborationWindow,
	): void {
		assertInserted(segment);

		const removalInfo = toRemovalInfo(segment);
		if (!removalInfo) {
			return;
		}

		const firstRemove = removalInfo?.removes[0];
		const minSeqStamp = getMinSeqStamp(collabWindow);
		if (firstRemove !== undefined && opstampUtils.lte(firstRemove, minSeqStamp)) {
			combinedPartialLengths.minLength -= segment.cachedLength;
			return;
		}

		const removalIsLocal = !!firstRemove && opstampUtils.isLocal(firstRemove);
		const isLocalInsertion = opstampUtils.isLocal(segment.insert);
		const isOnlyLocalRemoval = removalIsLocal;
		const isLocal = isLocalInsertion || isOnlyLocalRemoval;

		if (isLocalInsertion && !removalIsLocal) {
			throw new Error("Should have handled this codepath in wasRemovedOnInsertion");
		}

		const lenDelta = -segment.cachedLength;
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const seqOrLocalSeq = removalIsLocal ? firstRemove.localSeq! : firstRemove.seq;
		const clientId = firstRemove.clientId;

		const clientsWithRemoveOrObliterate = new Set<number>(
			removalInfo?.removes.map((stamp) => stamp.clientId),
		);

		const partials = isLocal
			? combinedPartialLengths.unsequencedRecords?.partialLengths
			: combinedPartialLengths.partialLengths;
		if (partials === undefined) {
			// Local partial but its computation isn't required
			return;
		}

		if (isLocal) {
			// The segment is either inserted only locally or removed only locally.
			// We already accounted for the insertion in the accountForInsertion codepath.
			// Only thing left to do is account for the removal in local partial lengths.
			// One thing to be careful about is that the removal should only apply to perspectives that saw
			// the segment's insertion in the first place.
			// When the segment's insertion was common knowledge (at or below minSeq) or also by the local client,
			// all possible perspectives will have seen it.
			if (
				opstampUtils.lte(segment.insert, minSeqStamp) ||
				collabWindow.clientId === segment.insert.clientId
			) {
				partials.addOrUpdate({
					seq: seqOrLocalSeq,
					clientId,
					len: 0,
					seglen: lenDelta,
				});
			} else {
				// ... otherwise, it's only visible to reconnecting perspectives above the seq of the insert.
				combinedPartialLengths.addLocalAdjustment({
					localSeq: seqOrLocalSeq,
					refSeq: segment.insert.seq,
					seglen: lenDelta,
				});
			}
		} else {
			partials.addOrUpdate({
				seq: seqOrLocalSeq,
				clientId,
				len: 0,
				seglen: lenDelta,
			});

			for (const id of clientsWithRemoveOrObliterate) {
				if (id === collabWindow.clientId) {
					// The local client also removed or obliterated this segment.
					const { localSeq } = removalInfo.removes[removalInfo.removes.length - 1];
					if (localSeq === undefined) {
						// Sure, the local client did it--but that change was already acked.
						// No need to account for it in the unsequenced records.
						continue;
					}
					const { unsequencedRecords } = combinedPartialLengths;
					if (!unsequencedRecords) {
						// Local partial but its computation isn't required.
						continue;
					}
					assert(
						localSeq !== undefined,
						0xaba /* Local client was in removed client ids but segment has no local seq for either */,
					);

					// Here...
					// - The segment was removed locally at `localSeq`
					// - The segment was also removed remotely at `seqOrLocalSeq`
					// - We're ensuring that partial lengths works for arbitrary `LocalReconnectingPerspective`s.
					//
					// Visualize an arbitrary local reconnecting perspective in 2d space, where the x-axis is `seq` and the y-axis is `localSeq`.
					// The events that have occurred to this segment divide the space into up to 6 regions:
					//
					//         (localSeq)
					//              |       |           |
					//              |   1   |     2     |    3
					// local remove |-----------------------------
					//              |       |           |
					//              |   4   |     5     |    6
					//              |----------------------------- (seq)
					//                    insert      remove
					// In all regions but region 5, the segment has length 0 (it was not inserted yet in regions 1 or 4, and removed locally and/or remotely
					// in regions 2, 3, and 6).
					// `accountForInsertion` already added a partial lengths adjustment of +segment.cachedLength for regions 2, 3, 5, and 6.
					// Above in this function, we've added a partial lengths adjustment of -segment.cachedLength for regions 3 and 6.
					//
					// Note that in this picture:
					// - Adding entries to `unsequencedRecords.partialLengths` is like adding adjustments that affect anything above a given Y value
					// - Adding entries to `combinedPartialLengths.partialLengths` is like adding adjustments that affect anything above a given X value
					// - Adding entries with `addLocalAdjustment` is like adding adjustments that affect anything above a given X *and* Y value
					// The remainder this block adds the necessary adjustments to make the length appear 0 in region 2 as well, keeping in mind that
					// region 1 may or may not exist depending on if the insertion is in the collab window.
					if (
						opstampUtils.isAcked(segment.insert) &&
						opstampUtils.greaterThan(segment.insert, minSeqStamp)
					) {
						combinedPartialLengths.addLocalAdjustment({
							refSeq: segment.insert.seq,
							localSeq,
							seglen: lenDelta,
						});
					} else {
						unsequencedRecords.partialLengths.addOrUpdate({
							seq: localSeq,
							clientId: collabWindow.clientId,
							seglen: lenDelta,
							len: 0,
						});
					}

					// Because we've included deltas which take effect when either of localSeq or refSeq are high enough,
					// we need to offset this with an adjustment that takes effect when both are high enough.
					combinedPartialLengths.addLocalAdjustment({
						refSeq: seqOrLocalSeq,
						localSeq,
						// combinedPartialLengths.partialLengths has an entry removing this segment from a perspective >= seqOrLocalSeq.
						// combinedPartialLengths.unsequencedRecords.partialLengths now has an entry removing this segment from a perspective
						// with local seq >= `localSeq`.
						// In order to only remove this segment once, we add back in the length (where this entry only takes effect when
						// both above are true due to logic in computeOverallRefSeqAdjustment).
						seglen: segment.cachedLength,
					});
				} else {
					// Note that all clients that have a remove or obliterate operation on this segment
					// use the seq of the winning obliterate in their per-client adjustments!
					combinedPartialLengths.addClientAdjustment(id, seqOrLocalSeq, lenDelta);

					// Also ensure that all these clients have seen the segment as inserted before being removed
					// This is technically not necessary for setRemoves (we never ask for the length of this block with
					// respect to a refSeq which this entry would affect), but it's simpler to just add it here.
					// We already add this entry as part of the accountForInsertion codepath for the client that
					// actually did insert the segment, hence not doing so [again] here.
					if (
						opstampUtils.greaterThan(segment.insert, minSeqStamp) &&
						id !== segment.insert.clientId
					) {
						combinedPartialLengths.addClientAdjustment(
							id,
							segment.insert.seq,
							segment.cachedLength,
						);
					}
				}
			}
		}
	}

	/**
	 * If incremental update of partial lengths fails, this gets set to the seq of the failed update.
	 * When higher up blocks attempt to incrementally update, they first check if the seq they are updating for
	 * matches this value. If it does, they propagate a full refresh instead.
	 */
	private lastIncrementalInvalidationSeq = Number.NEGATIVE_INFINITY;

	// Assume: seq is latest sequence number; no structural change to sub-tree, but this partial lengths
	// entry needs to account for the change made by the client with `clientId` at sequence number `seq`.
	// (and `update` has been called on all descendant PartialSequenceLengths).
	// This implementation does not support overlapping removes: callers should recompute partial lengths
	// using `combine` when the change that has just been applied involves such an operation.
	// TODO: assert client id matches
	public update(
		node: MergeBlock,
		seq: number,
		clientId: number,

		collabWindow: CollaborationWindow,
	): void {
		// In the current implementation, this method gets invoked multiple times for the same sequence number (i.e. mid-operation).
		// We counter this by first zeroing out existing entries from previous updates, but it isn't ideal.
		// Even if we fix this at the merge-tree level, the same type of issue can crop up with grouped batching enabled.
		const latest = this.partialLengths.latestLeq(seq);
		if (latest?.seq === seq) {
			this.partialLengths.addOrUpdate({ seq, len: 0, seglen: -latest.seglen, clientId });
		}

		// .forEach natively ignores undefined entries.
		// eslint-disable-next-line unicorn/no-array-for-each
		this.perClientAdjustments.forEach((clientAdjustments) => {
			const leqPartial = clientAdjustments.latestLeq(seq);
			if (leqPartial && leqPartial.seq === seq) {
				this.addClientAdjustment(clientId, seq, -leqPartial.seglen);
			}
		});

		/**
		 * If any of the changes made by the client at `seq` necessitate partial length entries at sequence numbers other than `seq`,
		 * this flag is set to true. This propagates upwards when aggregating parents as well.
		 *
		 * Note: it seems feasible to update parents more incrementally by tracking the changes made to child blocks for a given update.
		 * There isn't a great place for this information to flow today.
		 */
		let failIncrementalPropagation = false;

		let seqSeglen = 0;
		let segCount = 0;
		// Compute length for seq across children
		for (let i = 0; i < node.childCount; i++) {
			const child = node.children[i];
			if (child.isLeaf()) {
				const segment = child;
				const removalInfo = toRemovalInfo(segment);
				const firstRemove = removalInfo?.removes[0];
				if (seq === segment.insert.seq) {
					// if this segment was removed on insert, its length should
					// only be visible to the inserting client
					if (
						segment.insert.seq !== undefined &&
						firstRemove !== undefined &&
						wasRemovedOnInsert(segment)
					) {
						this.addClientAdjustment(clientId, firstRemove.seq, segment.cachedLength);
						failIncrementalPropagation = true;
					} else {
						seqSeglen += segment.cachedLength;
						this.addClientAdjustment(clientId, seq, segment.cachedLength);
					}
				}

				if (opstampUtils.isAcked(segment.insert) && seq === firstRemove?.seq) {
					seqSeglen -= segment.cachedLength;
					if (clientId !== collabWindow.clientId) {
						this.addClientAdjustment(clientId, seq, -segment.cachedLength);
						if (
							opstampUtils.greaterThan(segment.insert, getMinSeqStamp(collabWindow)) &&
							segment.insert.clientId !== clientId
						) {
							this.addClientAdjustment(clientId, segment.insert.seq, segment.cachedLength);
							failIncrementalPropagation = true;
						}
					}
				}

				segCount++;
			} else {
				const childBlock = child;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const branchPartialLengths = childBlock.partialLengths!;
				if (branchPartialLengths.lastIncrementalInvalidationSeq === seq) {
					// Bail out.
					const newPartials = PartialSequenceLengths.combine(node, collabWindow, false);
					newPartials.lastIncrementalInvalidationSeq = seq;
					node.partialLengths = newPartials;
					return;
				}
				const partialLengths = branchPartialLengths.partialLengths;
				const leqPartial = partialLengths.latestLeq(seq);
				if (leqPartial && leqPartial.seq === seq) {
					seqSeglen += leqPartial.seglen;
				}
				segCount += branchPartialLengths.segmentCount;

				// .forEach natively ignores undefined entries.
				// eslint-disable-next-line unicorn/no-array-for-each
				branchPartialLengths.perClientAdjustments.forEach((clientAdjustments) => {
					const leqBranchPartial = clientAdjustments.latestLeq(seq);
					if (leqBranchPartial && leqBranchPartial.seq === seq) {
						this.addClientAdjustment(clientId, seq, leqBranchPartial.seglen);
					}
				});
			}
		}

		if (failIncrementalPropagation) {
			this.lastIncrementalInvalidationSeq = seq;
		}
		this.segmentCount = segCount;
		this.unsequencedRecords = undefined;
		this.partialLengths.addOrUpdate({ seq, seglen: seqSeglen, len: 0, clientId });

		if (PartialSequenceLengths.options.zamboni) {
			this.zamboni(collabWindow);
		}
		PartialSequenceLengths.options.verifier?.(this);
	}

	/**
	 * Returns the length of this block as viewed from the perspective of `clientId` at `refSeq`.
	 * This is the total length of all segments sequenced at or before refSeq OR submitted by `clientId`.
	 * If `clientId` is the local client, `localSeq` can also be provided. In that case, it is the total
	 * length of all segments submitted at or before `refSeq` in addition to any local, unacked segments
	 * with `segment.localSeq <= localSeq`.
	 *
	 * Note: the local case (where `localSeq !== undefined`) is only supported on a PartialSequenceLength object
	 * constructed with `computeLocalPartials` set to true and not subsequently updated with `update`.
	 */
	public getPartialLength(refSeq: number, clientId: number, localSeq?: number): number {
		let length = this.minLength;
		length += this.partialLengths.latestLeq(refSeq)?.len ?? 0;

		if (localSeq === undefined) {
			const latestClientEntry = this.latestClientEntry(clientId);
			if (latestClientEntry !== undefined && latestClientEntry.seq > refSeq) {
				// The client has local edits after refSeq, add in the length adjustments
				length += latestClientEntry.len;
				const precedingCli = this.latestClientEntryLEQ(clientId, refSeq);
				if (precedingCli) {
					// Subtract out double-counted lengths: segments still in the collab window but before
					// the refSeq submitted by the client we're querying for were counted in each addition above.
					length -= precedingCli.len;
				}
			}
		} else {
			assert(
				this.unsequencedRecords !== undefined,
				0x39f /* Local getPartialLength invoked without computing local partials. */,
			);
			const unsequencedPartialLengths = this.unsequencedRecords.partialLengths;
			// Local segments at or before localSeq should also be included
			length += unsequencedPartialLengths.latestLeq(localSeq)?.len ?? 0;

			// Lastly, we must add in any additional adjustment that should only take effect when both
			// refSeq AND localSeq are above some threshold. This accounts for things like double-counting
			// local+remote removes, or only subtracting the length out of a local remove if we've also seen
			// the insert of the segment it affects. (see addLocalAdjustment usages for examples)
			length += this.computeOverallRefSeqAdjustment(refSeq, localSeq);
		}
		return length;
	}

	/**
	 * Computes the seglen for the double-counted removed overlap at (refSeq, localSeq).
	 *
	 * Reconnect happens to only need to compute these lengths for two refSeq values: before and
	 * after the rebase. Since these lists potentially scale with O(collab window * number of local edits)
	 * and potentially need to be queried for each local op that gets rebased,
	 * we cache the results for a given refSeq in `this.unsequencedRecords.cachedOverlappingByRefSeq` so
	 * that they can be binary-searched the same way the usual partialLengths lists are.
	 */
	private computeOverallRefSeqAdjustment(refSeq: number, localSeq: number): number {
		if (this.unsequencedRecords === undefined) {
			return 0;
		}

		let cachedAdjustment = this.unsequencedRecords.cachedAdjustmentByRefSeq.get(refSeq);
		if (!cachedAdjustment) {
			const partials: PartialSequenceLengthsSet = new PartialSequenceLengthsSet();
			for (const [
				seq,
				adjustments,
			] of this.unsequencedRecords.perRefSeqAdjustments.entries()) {
				if (seq > refSeq) {
					// TODO: Prior code path got away with an early exit here by sorting the entries by refSeq.
					// We could do the same here if we wanted.
					// Old codepath basically flattened the 2d array into a 1d array with both dimensions listed.
					continue;
				}

				for (const partial of adjustments.items) {
					// This coalesces entries with the same localSeq as well as computes overall lengths.
					partials.addOrUpdate({ ...partial });
				}
			}
			cachedAdjustment = partials;
			this.unsequencedRecords.cachedAdjustmentByRefSeq.set(refSeq, cachedAdjustment);
		}

		const overlap = cachedAdjustment.latestLeq(localSeq);
		return overlap?.len ?? 0;
	}

	public toString(glc?: (id: number) => string, indentCount = 0): string {
		let buf = "";
		for (const partial of this.partialLengths.items) {
			buf += `(${partial.seq},${partial.len}) `;
		}

		// eslint-disable-next-line @typescript-eslint/no-for-in-array, no-restricted-syntax
		for (const clientId in this.perClientAdjustments) {
			if (this.perClientAdjustments[clientId].size > 0) {
				buf += `Client `;
				buf += glc ? `${glc(+clientId)}` : `${clientId}`;
				buf += "[";
				for (const partial of this.perClientAdjustments[clientId].items) {
					buf += `(${partial.seq},${partial.len})`;
				}
				buf += "]";
			}
		}
		buf = `min(seq ${this.minSeq}): ${this.minLength}; sc: ${this.segmentCount};${buf}`;
		return buf;
	}

	// Clear away partial sums for sequence numbers earlier than the current window

	private zamboni(segmentWindow: CollaborationWindow): void {
		this.minLength += this.partialLengths.copyDown(segmentWindow.minSeq);
		this.minSeq = segmentWindow.minSeq;
		// eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in, no-restricted-syntax
		for (const clientId in this.perClientAdjustments) {
			const cliPartials = this.perClientAdjustments[clientId];
			if (cliPartials) {
				cliPartials.copyDown(segmentWindow.minSeq);
			}
		}
	}

	private addClientAdjustment(clientId: number, seq: number, seglen: number): void {
		this.perClientAdjustments[clientId] ??= new PartialSequenceLengthsSet();
		const cli = this.perClientAdjustments[clientId];
		cli.addOrUpdate({ seq, len: 0, seglen });
	}

	private addLocalAdjustment({
		refSeq,
		localSeq,
		seglen,
	}: { refSeq: number; localSeq: number; seglen: number }): void {
		assert(
			this.unsequencedRecords !== undefined,
			0xabb /* Local adjustment computed without partials */,
		);
		const adjustments =
			this.unsequencedRecords.perRefSeqAdjustments.get(refSeq) ??
			new PartialSequenceLengthsSet();
		this.unsequencedRecords.perRefSeqAdjustments.set(refSeq, adjustments);
		adjustments.addOrUpdate({ seq: localSeq, len: 0, seglen });
	}

	/**
	 * Returns the partial lengths associated with the latest change associated with `clientId` at or before `refSeq`.
	 * Returns undefined if no such change exists.
	 */
	private latestClientEntryLEQ(
		clientId: number,
		refSeq: number,
	): PartialSequenceLength | undefined {
		return this.perClientAdjustments[clientId]?.latestLeq(refSeq);
	}

	/**
	 * Get the partial lengths associated with the most recent change received by `clientId`, or undefined
	 * if this client has made no changes in this block within the collab window.
	 */
	private latestClientEntry(clientId: number): PartialSequenceLength | undefined {
		const cliSeqs = this.perClientAdjustments[clientId];
		return cliSeqs && cliSeqs.size > 0 ? cliSeqs.items[cliSeqs.size - 1] : undefined;
	}
}

/* eslint-disable @typescript-eslint/dot-notation */
function verifyPartialLengthsInner(
	partialSeqLengths: PartialSequenceLengths,
	partialLengths: PartialSequenceLengthsSet,
	clientPartials: boolean,
): number {
	if (partialLengths.size === 0) {
		return 0;
	}

	let lastSeqNum = 0;
	let accumSegLen = 0;
	let count = 0;

	for (const partialLength of partialLengths.items) {
		// Count total number of partial length entries
		count++;

		// Sequence number should be larger or equal to minseq
		assert(
			partialSeqLengths.minSeq <= partialLength.seq,
			0x054 /* "Sequence number less than minSeq!" */,
		);

		// Sequence number should be sorted
		assert(lastSeqNum < partialLength.seq, 0x055 /* "Sequence number is not sorted!" */);
		lastSeqNum = partialLength.seq;

		// Len is a accumulation of all the seglen adjustments
		accumSegLen += partialLength.seglen;
		if (accumSegLen !== partialLength.len) {
			assert(
				false,
				0x056 /* "Unexpected total for accumulation of all seglen adjustments!" */,
			);
		}

		if (clientPartials) {
			// Client partials used to track local edits so we can account for them some refSeq.
			// But the information we keep track of are since minSeq, so we keep track of more history
			// then needed, and some of them doesn't make sense to be used for length calculations
			// e.g. if you have this sequence, where the minSeq is #5 because of other clients
			//    seq 10: client 1: insert seg #1
			//    seq 11: client 2: delete seg #2 refseq: 10
			// minLength is 0, we would have keep a record of seglen: -1 for clientPartialLengths for client 2
			// So if you ask for partial length for client 2 @ seq 5, we will have return -1.
			// However, that combination is invalid, since we should never see any ops with refseq < 10 for
			// client 2 after seq 11.
		} else {
			// Len adjustment should not make length negative
			if (partialSeqLengths["minLength"] + partialLength.len < 0) {
				assert(false, 0x057 /* "Negative length after length adjustment!" */);
			}
		}
	}
	return count;
}

export function verifyExpectedPartialLengths(
	mergeTree: MergeTree,
	node: MergeBlock,
	refSeq: number,
	clientId: number,
	localSeq?: number,
): void {
	if (
		(!mergeTree.collabWindow.collaborating || mergeTree.collabWindow.clientId === clientId) &&
		(node.isLeaf() || localSeq === undefined)
	) {
		return;
	}

	const partialLen = node.partialLengths?.getPartialLength(refSeq, clientId, localSeq);

	let expected = 0;
	const nodesToVisit: IMergeNode[] = [node];
	const perspective =
		clientId === mergeTree.collabWindow.clientId
			? localSeq === undefined
				? new LocalDefaultPerspective(clientId)
				: new LocalReconnectingPerspective(refSeq, clientId, localSeq)
			: new PriorPerspective(refSeq, clientId);

	while (nodesToVisit.length > 0) {
		const thisNode = nodesToVisit.pop();
		if (!thisNode) {
			continue;
		}
		if (thisNode.isLeaf()) {
			expected += mergeTree["nodeLength"](thisNode, perspective) ?? 0;
		} else {
			nodesToVisit.push(...thisNode.children.slice(0, thisNode.childCount));
		}
	}

	if (expected !== partialLen) {
		const nonIncrementalPartials = PartialSequenceLengths.combine(
			node,
			mergeTree.collabWindow,
			false,
			true,
		);
		const nonIncrementalLength = nonIncrementalPartials.getPartialLength(
			refSeq,
			clientId,
			localSeq,
		);
		node.partialLengths?.getPartialLength(refSeq, clientId, localSeq);

		throw new Error(
			`expected partial length of ${expected} but found ${partialLen}. refSeq: ${refSeq}, clientId: ${clientId}. (non-incremental codepath returned ${nonIncrementalLength})`,
		);
	}
}

export function verifyPartialLengths(partialSeqLengths: PartialSequenceLengths): void {
	if (partialSeqLengths["perClientAdjustments"]) {
		for (const cliSeq of partialSeqLengths["perClientAdjustments"]) {
			if (cliSeq) {
				verifyPartialLengthsInner(partialSeqLengths, cliSeq, true);
			}
		}

		// If we have client view, we should have the flat view
		assert(
			!!partialSeqLengths["partialLengths"],
			0x059 /* "Client view exists but flat view does not!" */,
		);

		verifyPartialLengthsInner(partialSeqLengths, partialSeqLengths["partialLengths"], false);
	} else {
		// If we don't have a client view, we shouldn't have the flat view either
		assert(
			!partialSeqLengths["partialLengths"],
			0x05b /* "Flat view exists but client view does not!" */,
		);
	}
}
/* eslint-enable @typescript-eslint/dot-notation */

/**
 * Given a number of seq-sorted `partialLength` lists, merges them into a combined seq-sorted `partialLength`
 * list. This merge includes coalescing `PartialSequenceLength` entries at the same seq.
 *
 * Ex: merging the following two lists (some information omitted on each PartialSequenceLength):
 * ```typescript
 * [{ seq: 1, seglen: 5 }, { seq: 3, seglen: -1 }]
 * [{ seq: 1, seglen: -3 }, { seq: 2: seglen: 4 }]
 * ```
 * would produce
 * ```typescript
 * [{ seq: 1, seglen: 2 }, { seq: 2, seglen: 4 }, { seq: 3, seglen: -1 }]
 * ```
 */
function mergePartialLengths(
	childPartialLengths: PartialSequenceLength[][],
	mergedLengths: PartialSequenceLengthsSet = new PartialSequenceLengthsSet(),
): PartialSequenceLengthsSet {
	for (const partialLength of mergeSortedListsBySeq(childPartialLengths)) {
		mergedLengths.addOrUpdate({
			...partialLength,
		});
	}
	return mergedLengths;
}

/**
 * Given a collection of PartialSequenceLength lists--each sorted by sequence number--returns an iterable that yields
 * each PartialSequenceLength in sequence order.
 *
 * This is equivalent to flattening the input list and sorting it by sequence number. If the number of lists to merge is
 * a constant, however, this approach is advantageous asymptotically.
 */
function mergeSortedListsBySeq<T extends PartialSequenceLength>(lists: T[][]): Iterable<T> {
	class PartialSequenceLengthIterator {
		/**
		 * nextSmallestIndex[i] is the next element of sublists[i] to check.
		 * In other words, the iterator has already yielded elements of sublists[i] *up through*
		 * sublists[i][nextSmallestIndex[i] - 1].
		 */
		private readonly nextSmallestIndex: number[];

		constructor(private readonly sublists: T[][]) {
			this.nextSmallestIndex = Array.from({ length: sublists.length });
			for (let i = 0; i < sublists.length; i++) {
				this.nextSmallestIndex[i] = 0;
			}
		}

		public next(): { value: T; done: false } | { value: undefined; done: true } {
			const len = this.sublists.length;
			let currentMin: T | undefined;
			let currentMinIndex: number | undefined;
			for (let i = 0; i < len; i++) {
				const candidateIndex = this.nextSmallestIndex[i];
				if (candidateIndex < this.sublists[i].length) {
					const candidate = this.sublists[i][candidateIndex];
					if (!currentMin || candidate.seq < currentMin.seq) {
						currentMin = candidate;
						currentMinIndex = i;
					}
				}
			}

			if (currentMin) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.nextSmallestIndex[currentMinIndex!]++;
				return { value: currentMin, done: false };
			} else {
				return { value: undefined, done: true };
			}
		}
	}

	return { [Symbol.iterator]: () => new PartialSequenceLengthIterator(lists) };
}
