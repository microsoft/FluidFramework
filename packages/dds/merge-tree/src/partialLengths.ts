/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Property, RedBlackTree } from "./collections";
import { UnassignedSequenceNumber } from "./constants";
import {
    CollaborationWindow,
    compareNumbers,
    IMergeBlock,
    IRemovalInfo,
    ISegment,
    toRemovalInfo,
} from "./mergeTreeNodes";
import { SortedSet } from "./sortedSet";

class PartialSequenceLengthsSet extends SortedSet<PartialSequenceLength, number> {
    protected getKey(item: PartialSequenceLength): number {
        return item.seq;
    }

    public addOrUpdate(
        newItem: PartialSequenceLength,
        update?: (existingItem: PartialSequenceLength, newItem: PartialSequenceLength) => void,
    ) {
        const prev = this.latestLeq(newItem.seq);

        if (prev?.seq !== newItem.seq) {
            // new element, update len
            newItem.len = (prev?.len ?? 0) + newItem.seglen;
        }

        // update the len of all following elements
        for (let i = this.keySortedItems.length - 1; i >= 0; i--) {
            const element = this.keySortedItems[i];
            if (!element || element.seq <= newItem.seq) {
                break;
            }

            element.len += newItem.seglen;
        }

        super.addOrUpdate(newItem, (currentPartial, partialLength) => {
            currentPartial.seglen += partialLength.seglen;
            currentPartial.len += partialLength.seglen;
            combineOverlapClients(currentPartial, partialLength);
        });
    }

    /**
     * Returns the partial length whose sequence number is the greatest sequence
     * number that is less than or equal to key.
     * @param key - sequence number
     */
    latestLeq(key: number): PartialSequenceLength | undefined {
        return this.keySortedItems[this.latestLeqIndex(key)];
    }

    /**
     * Returns the partial length whose sequence number is the lowest sequence
     * number that is greater than or equal to key.
     * @param key - sequence number
     */
    firstGte(key: number): PartialSequenceLength | undefined {
        const { index } = this.findItemPosition({ seq: key, len: 0, seglen: 0 });
        return this.keySortedItems[index];
    }

    private latestLeqIndex(key: number): number {
        const { exists, index } = this.findItemPosition({ seq: key, len: 0, seglen: 0 });
        return exists ? index : index - 1;
    }

    copyDown(minSeq: number): number {
        const mindex = this.latestLeqIndex(minSeq);
        let minLength = 0;
        if (mindex >= 0) {
            minLength = this.keySortedItems[mindex].len;
            const seqCount = this.size;
            if (mindex <= (seqCount - 1)) {
                // Still some entries remaining
                const remainingCount = (seqCount - mindex) - 1;
                // Copy down
                for (let i = 0; i < remainingCount; i++) {
                    this.keySortedItems[i] = this.keySortedItems[i + mindex + 1];
                    this.keySortedItems[i].len -= minLength;
                }
                this.keySortedItems.length = remainingCount;
            }
        }
        return minLength;
    }
}

interface IOverlapClient {
    clientId: number;
    seglen: number;
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
    /**
     * This field maps each client to the size of the intersection between segments deleted at this seq
     * and segments concurrently deleted by that client.
     *
     * For example, this PartialSequenceLength:
     * ```typescript
     * {
     *     seq: 5,
     *     len: 100,
     *     seglen: -10,
     *     clientId: 0,
     *     overlapRemoveClients: <RedBlack tree with key-values expressed by>{
     *         1: { clientId: 1, seglen: -5 },
     *         3: { clientId: 3, seglen: -10 }
     *     }
     * }
     * ```
     *
     * corresponds to an op submitted by client 0 which:
     * - reduces the length of this block by 10 (it may have deleted a single segment of length 10,
     *     several segments totalling length 10, or even delete and add content for a total reduction of 10 length)
     * - was concurrent to an op submitted by client 1 that also removed some of the same segments,
     *     whose length totalled 5
     * - was concurrent to an op submitted by client 3 that removed some of the same segments,
     *     whose length totalled 10
     */
    overlapRemoveClients?: RedBlackTree<number, IOverlapClient>;
}

interface UnsequencedPartialLengthInfo {
    /**
     * Contains entries for all local operations.
     * The "seq" field of each entry actually corresponds to the delta at that localSeq on the local client.
     */
    partialLengths: PartialSequenceLengthsSet;

    /**
     * Only contains entries for segments (or aggregates thereof) which were concurrently deleted
     * by another client. Ordered by `seq` of the removing client.
     *
     * The "length" field of these entries is not populated. This is because pre-computing the lengths
     * of segments doesn't help given the usage pattern.
     *
     * These entries need both `seq` and `localSeq`, because a given segment remove is double-counted iff
     * the refSeq exceeds the seq of the remote remove AND the localSeq exceeds the localSeq of the local remove.
     */
    overlappingRemoves: LocalPartialSequenceLength[];

    /**
     * Cached keyed on refSeq which stores length information for the total overlap of removed segments at
     * that refSeq.
     * This information is derivable from the entries of `overlappingRemoves`.
     *
     * Like the `partialLengths` field, `seq` on each entry is actually the local seq.
     * See `computeOverlappingLocalRemoves` for more information.
     */
    cachedOverlappingByRefSeq: Map<number, PartialSequenceLengthsSet>;
}

interface LocalPartialSequenceLength extends PartialSequenceLength {
    /**
     * Local sequence number
     */
    localSeq: number;
}

/**
 * Keeps track of partial sums of segment lengths for all sequence numbers in the current collaboration window.
 * Only used during active collaboration.
 *
 * This class is associated with an internal node (block) of a MergeTree. It efficiently answers queries of the form
 * "What is the length of `block` from the perspective of some particular seq and clientId?".
 *
 * It also supports incremental updating of state for newly-sequenced ops that don't affect the structure of the
 * MergeTree.
 *
 * To answer these queries, it pre-builds several lists which track the length of the block at a per-sequence-number
 * level. These lists are:
 *
 * 1. (`partialLengths`): Stores the total length of the block.
 * 2. (`clientSeqNumbers[clientId]`): Stores only the total lengths of segments submitted by `clientId`. [see footnote]
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
 * - (overlapping remove of the unsequenced edits' total length at refSeq)
 *
 * This algorithm scales roughly linearly with number of editing clients and the size of the collab window.
 * (certain unlikely sequences of operations may introduce log factors on those variables)
 *
 * Note: there is some slight complication with clientSeqNumbers resulting from the possibility of different clients
 * concurrently removing the same segment. See the field's documentation for more details.
 */
export class PartialSequenceLengths {
    public static options = {
        verify: false,
        zamboni: true,
    };

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
        block: IMergeBlock,
        collabWindow: CollaborationWindow,
        recur = false,
        computeLocalPartials = false,
    ): PartialSequenceLengths {
        const leafPartialLengths = PartialSequenceLengths.fromLeaves(block, collabWindow, computeLocalPartials);

        let hasInternalChild = false;
        const childPartials: PartialSequenceLengths[] = [];
        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            if (!child.isLeaf()) {
                hasInternalChild = true;
                if (recur) {
                    child.partialLengths =
                        PartialSequenceLengths.combine(child, collabWindow, true, computeLocalPartials);
                }
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                childPartials.push(child.partialLengths!);
            }
        }

        // If there are no internal children, the PartialSequenceLengths returns from `fromLeaves` is exactly correct.
        // Otherwise, we must additively combine all of the children partial lengths to get this block's totals.
        const combinedPartialLengths = hasInternalChild ?
            new PartialSequenceLengths(collabWindow.minSeq, computeLocalPartials) : leafPartialLengths;
        if (hasInternalChild) {
            if (leafPartialLengths.partialLengths.size > 0) {
                // Some children were leaves; add combined partials from these segments
                childPartials.push(leafPartialLengths);
            }

            const childPartialsLen = childPartials.length;

            const childPartialLengths: PartialSequenceLength[][] = [];
            const childUnsequencedPartialLengths: PartialSequenceLength[][] = [];
            const childOverlapRemoves: LocalPartialSequenceLength[][] = [];
            for (let i = 0; i < childPartialsLen; i++) {
                const { segmentCount, minLength, partialLengths, unsequencedRecords } = childPartials[i];
                combinedPartialLengths.segmentCount += segmentCount;
                combinedPartialLengths.minLength += minLength;
                childPartialLengths.push(partialLengths.items as PartialSequenceLength[]);
                if (unsequencedRecords) {
                    childUnsequencedPartialLengths.push(
                        unsequencedRecords.partialLengths.items as PartialSequenceLength[]);
                    childOverlapRemoves.push(unsequencedRecords.overlappingRemoves);
                }
            }

            mergePartialLengths(childPartialLengths, combinedPartialLengths.partialLengths);

            if (computeLocalPartials) {
                combinedPartialLengths.unsequencedRecords = {
                    partialLengths: mergePartialLengths(childUnsequencedPartialLengths),
                    overlappingRemoves: Array.from(mergeSortedListsBySeq(childOverlapRemoves)),
                    cachedOverlappingByRefSeq: new Map(),
                };
            }

            for (const partial of combinedPartialLengths.partialLengths.items) {
                combinedPartialLengths.addClientSeqNumberFromPartial(partial);
            }
        }
        // TODO: incremental zamboni during build
        if (PartialSequenceLengths.options.zamboni) {
            combinedPartialLengths.zamboni(collabWindow);
        }

        if (PartialSequenceLengths.options.verify) {
            verify(combinedPartialLengths);
        }

        return combinedPartialLengths;
    }

    /**
     * @returns a PartialSequenceLengths structure which tracks only lengths of leaf children of the provided
     * IMergeBlock.
     */
    private static fromLeaves(
        block: IMergeBlock,
        collabWindow: CollaborationWindow,
        computeLocalPartials: boolean,
    ): PartialSequenceLengths {
        const combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq, computeLocalPartials);
        combinedPartialLengths.segmentCount = block.childCount;

        function seqLTE(seq: number | undefined, minSeq: number) {
            return seq !== undefined && seq !== UnassignedSequenceNumber && seq <= minSeq;
        }

        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            if (child.isLeaf()) {
                // Leaf segment
                const segment = child;
                if (seqLTE(segment.seq, collabWindow.minSeq)) {
                    combinedPartialLengths.minLength += segment.cachedLength;
                } else {
                    PartialSequenceLengths.insertSegment(combinedPartialLengths, segment);
                }
                const removalInfo = toRemovalInfo(segment);
                if (seqLTE(removalInfo?.removedSeq, collabWindow.minSeq)) {
                    combinedPartialLengths.minLength -= segment.cachedLength;
                } else if (removalInfo !== undefined) {
                    PartialSequenceLengths.insertSegment(
                        combinedPartialLengths,
                        segment,
                        removalInfo);
                }
            }
        }
        // Post-process correctly-ordered partials computing sums and creating
        // lists for each present client id
        const seqPartials = combinedPartialLengths.partialLengths;

        let prevLen = 0;
        for (const partial of seqPartials.items) {
            partial.len = prevLen + partial.seglen;
            prevLen = partial.len;
            combinedPartialLengths.addClientSeqNumberFromPartial(partial);
        }
        prevLen = 0;

        if (combinedPartialLengths.unsequencedRecords !== undefined) {
            const localPartials = combinedPartialLengths.unsequencedRecords.partialLengths;
            for (const partial of localPartials.items) {
                partial.len = prevLen + partial.seglen;
                prevLen = partial.len;
            }
        }

        if (PartialSequenceLengths.options.verify) {
            verify(combinedPartialLengths);
        }
        return combinedPartialLengths;
    }

    private static getOverlapClients(overlapClientIds: number[], seglen: number) {
        const bst = new RedBlackTree<number, IOverlapClient>(compareNumbers);
        for (const clientId of overlapClientIds) {
            bst.put(clientId, { clientId, seglen });
        }
        return bst;
    }

    private static accumulateRemoveClientOverlap(
        partialLength: PartialSequenceLength,
        overlapRemoveClientIds: number[],
        seglen: number) {
        if (partialLength.overlapRemoveClients) {
            for (const clientId of overlapRemoveClientIds) {
                const overlapClientNode = partialLength.overlapRemoveClients.get(clientId);
                if (!overlapClientNode) {
                    partialLength.overlapRemoveClients.put(clientId, { clientId, seglen });
                } else {
                    overlapClientNode.data.seglen += seglen;
                }
            }
        } else {
            partialLength.overlapRemoveClients =
                PartialSequenceLengths.getOverlapClients(overlapRemoveClientIds, seglen);
        }
    }

    /**
     * Inserts length information about the insertion of `segment` into `combinedPartialLengths.partialLengths`.
     * Does not update the clientSeqNumbers field to account for this segment.
     * If `removalInfo` is defined, this operation updates the bookkeeping to account for the removal of this
     * segment at the removedSeq instead.
     * When the insertion or removal of the segment is un-acked and `combinedPartialLengths` is meant to compute
     * such records, this does the analogous addition to the bookkeeping for the local segment in
     * `combinedPartialLengths.unsequencedRecords`.
     */
    private static insertSegment(
        combinedPartialLengths: PartialSequenceLengths,
        segment: ISegment,
        removalInfo?: IRemovalInfo) {
        const isLocal = (removalInfo === undefined && segment.seq === UnassignedSequenceNumber)
            || (removalInfo !== undefined && segment.removedSeq === UnassignedSequenceNumber);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let seqOrLocalSeq = isLocal ? segment.localSeq! : segment.seq!;
        let segmentLen = segment.cachedLength;
        let clientId = segment.clientId;
        let removeClientOverlap: number[] | undefined;

        if (removalInfo) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            seqOrLocalSeq = isLocal ? removalInfo.localRemovedSeq! : removalInfo.removedSeq;
            segmentLen = -segmentLen;
            // The client who performed the remove is always stored
            // in the first position of removalInfo.
            clientId = removalInfo.removedClientIds[0];
            const hasOverlap = removalInfo.removedClientIds.length > 1;
            removeClientOverlap = hasOverlap ? removalInfo.removedClientIds : undefined;
        }

        const partials = isLocal
            ? combinedPartialLengths.unsequencedRecords?.partialLengths
            : combinedPartialLengths.partialLengths;
        if (partials === undefined) {
            // Local partial but its computation isn't required
            return;
        }

        const firstGte = partials.firstGte(seqOrLocalSeq);

        let partialLengthEntry: PartialSequenceLength;
        if (firstGte?.seq === seqOrLocalSeq) {
            partialLengthEntry = firstGte;
            // Existing entry at this seq--this occurs for ops that insert/delete more than one segment.
            partialLengthEntry.seglen += segmentLen;
            if (removeClientOverlap) {
                PartialSequenceLengths.accumulateRemoveClientOverlap(
                    firstGte,
                    removeClientOverlap,
                    segmentLen);
            }
        } else {
            partialLengthEntry = {
                seq: seqOrLocalSeq,
                clientId,
                len: 0,
                seglen: segmentLen,
                overlapRemoveClients: removeClientOverlap
                    ? PartialSequenceLengths.getOverlapClients(removeClientOverlap, segmentLen)
                    : undefined,
            };

            partials.addOrUpdate(partialLengthEntry);
        }

        const { unsequencedRecords } = combinedPartialLengths;
        if (unsequencedRecords && removeClientOverlap && segment.localRemovedSeq !== undefined) {
            const localSeq = segment.localRemovedSeq;
            const localPartialLengthEntry: LocalPartialSequenceLength = {
                seq: seqOrLocalSeq,
                localSeq,
                clientId,
                len: 0,
                seglen: segmentLen,
            };
            let localIndexFirstGTE = 0;
            for (; localIndexFirstGTE < unsequencedRecords.overlappingRemoves.length; localIndexFirstGTE++) {
                if (unsequencedRecords.overlappingRemoves[localIndexFirstGTE].seq >= seqOrLocalSeq) {
                    break;
                }
            }

            insertIntoList(unsequencedRecords.overlappingRemoves, localIndexFirstGTE, localPartialLengthEntry);

            const tweakedLocalPartialEntry = {
                ...localPartialLengthEntry,
                seq: localSeq,
            };

            unsequencedRecords.partialLengths.addOrUpdate(tweakedLocalPartialEntry);
        }
    }

    private static addSeq(
        partialLengths: PartialSequenceLengthsSet,
        seq: number,
        seqSeglen: number,
        clientId?: number,
    ) {
        let seqPartialLen: PartialSequenceLength | undefined;
        let penultPartialLen: PartialSequenceLength | undefined;
        let pLen = partialLengths.latestLeq(seq);
        if (pLen) {
            if (pLen.seq === seq) {
                seqPartialLen = pLen;
                pLen = partialLengths.latestLeq(seq - 1);
                if (pLen) {
                    penultPartialLen = pLen;
                }
            } else {
                penultPartialLen = pLen;
            }
        }
        const len = penultPartialLen !== undefined ? penultPartialLen.len + seqSeglen : seqSeglen;
        if (seqPartialLen === undefined) {
            seqPartialLen = {
                clientId,
                len,
                seglen: seqSeglen,
                seq,
            };
            partialLengths.addOrUpdate(seqPartialLen);
        } else {
            seqPartialLen.seglen = seqSeglen;
            seqPartialLen.len = len;
            // Assert client id matches
        }
    }

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
     * `partialLengths[i].len` contains the length of this block considering only sequenced segments with
     * `sequenceNumber <= partialLengths[i].seq`.
     */
    private readonly partialLengths: PartialSequenceLengthsSet = new PartialSequenceLengthsSet();

    /**
     * clientSeqNumbers[clientId] is a list of partial lengths for sequenced ops which either:
     * - were submitted by `clientId`.
     * - deleted a range containing segments that were concurrently deleted by `clientId`
     *
     * The second case is referred to as the "overlapping delete" case. It is necessary to avoid double-counting
     * the removal of those segments in queries including clientId.
     */
    private readonly clientSeqNumbers: PartialSequenceLengthsSet[] = [];

    /**
     * Contains information required to answer queries for the length of this segment from the perspective of
     * the local client but not including all local segments (i.e., `localSeq !== collabWindow.localSeq`).
     * This field is only computed if requested in the constructor (i.e. `computeLocalPartials === true`).
     */
    private unsequencedRecords: UnsequencedPartialLengthInfo | undefined;

    constructor(
        /**
         * The minimumSequenceNumber as defined by the collab window used in the last call to `update`,
         * or if no such calls have been made, the one used on construction.
        */
        public minSeq: number,
        computeLocalPartials: boolean) {
            if (computeLocalPartials) {
                this.unsequencedRecords = {
                    partialLengths: new PartialSequenceLengthsSet(),
                    overlappingRemoves: [],
                    cachedOverlappingByRefSeq: new Map(),
                };
            }
        }

    // Assume: seq is latest sequence number; no structural change to sub-tree, but a segment
    // with sequence number seq has been added within the sub-tree (and `update` has been called
    // on all descendant PartialSequenceLengths)
    // TODO: assert client id matches
    public update(
        node: IMergeBlock,
        seq: number,
        clientId: number,
        collabWindow: CollaborationWindow) {
        let seqSeglen = 0;
        let segCount = 0;
        // Compute length for seq across children
        for (let i = 0; i < node.childCount; i++) {
            const child = node.children[i];
            if (!child.isLeaf()) {
                const childBlock = child;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const branchPartialLengths = childBlock.partialLengths!;
                const partialLengths = branchPartialLengths.partialLengths;
                const leqPartial = partialLengths.latestLeq(seq);
                if (leqPartial) {
                    if (leqPartial.seq === seq) {
                        seqSeglen += leqPartial.seglen;
                    }
                }
                segCount += branchPartialLengths.segmentCount;
            } else {
                const segment = child;
                const removalInfo = toRemovalInfo(segment);

                if (segment.seq === seq) {
                    if (removalInfo?.removedSeq !== seq) {
                        seqSeglen += segment.cachedLength;
                    }
                } else {
                    if (removalInfo?.removedSeq === seq) {
                        seqSeglen -= segment.cachedLength;
                    }
                }
                segCount++;
            }
        }
        this.segmentCount = segCount;
        this.unsequencedRecords = undefined;

        PartialSequenceLengths.addSeq(this.partialLengths, seq, seqSeglen, clientId);
        this.clientSeqNumbers[clientId] ??= new PartialSequenceLengthsSet();
        PartialSequenceLengths.addSeq(this.clientSeqNumbers[clientId], seq, seqSeglen);
        if (PartialSequenceLengths.options.zamboni) {
            this.zamboni(collabWindow);
        }
        if (PartialSequenceLengths.options.verify) {
            verify(this);
        }
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
    public getPartialLength(refSeq: number, clientId: number, localSeq?: number) {
        let pLen = this.minLength;
        const cliLatestIndex = this.cliLatest(clientId);
        const cliSeq = this.clientSeqNumbers[clientId];
        pLen += this.partialLengths.latestLeq(refSeq)?.len ?? 0;

        if (localSeq === undefined) {
            if (cliLatestIndex >= 0) {
                const cliLatest = cliSeq.items[cliLatestIndex];
                if (cliLatest.seq > refSeq) {
                    // The client has local edits after refSeq, add in the length adjustments
                    pLen += cliLatest.len;
                    const precedingCli = this.cliLatestLEQ(clientId, refSeq);
                    if (precedingCli) {
                        // Subtract out double-counted lengths: segments still in the collab window but before
                        // the refSeq submitted by the client we're querying for were counted in each addition above.
                        pLen -= precedingCli.len;
                    }
                }
            }
        } else {
            assert(this.unsequencedRecords !== undefined,
                0x39f /* Local getPartialLength invoked without computing local partials. */);
            const unsequencedPartialLengths = this.unsequencedRecords.partialLengths;
            // Local segments at or before localSeq should also be included
            const local = unsequencedPartialLengths.latestLeq(localSeq);
            if (local) {
                pLen += local.len;

                // Lastly, we must subtract out any double-counted removes, which occur if a currently un-acked local
                // remove overlaps with a remote client's remove that occurred at sequence number <=refSeq.
                pLen -= this.computeOverlappingLocalRemoves(refSeq, localSeq);
            }
        }
        return pLen;
    }

    /**
     * Computes the seglen for the double-counted removed overlap at (refSeq, localSeq). This logic is equivalent
     * to the following:
     *
     * ```typescript
     *   let total = 0;
     *   for (const partialLength of this.unsequencedRecords!.overlappingRemoves) {
     *       if (partialLength.seq > refSeq) {
     *           break;
     *       }
     *
     *      if (partialLength.localSeq <= localSeq) {
     *          total += partialLength.seglen;
     *      }
     *   }
     *
     *   return total;
     * ```
     *
     * Reconnect happens to only need to compute these lengths for two refSeq values: before and
     * after the rebase. Since these lists potentially scale with O(collab window * number of local edits)
     * and potentially need to be queried for each local op that gets rebased,
     * we cache the results for a given refSeq in `this.unsequencedRecords.cachedOverlappingByRefSeq` so
     * that they can be binary-searched the same way the usual partialLengths lists are.
     */
    private computeOverlappingLocalRemoves(refSeq: number, localSeq: number): number {
        if (this.unsequencedRecords === undefined) {
            return 0;
        }

        let cachedOverlapPartials = this.unsequencedRecords.cachedOverlappingByRefSeq.get(refSeq);
        if (!cachedOverlapPartials) {
            const partials: PartialSequenceLengthsSet = new PartialSequenceLengthsSet();
            for (const partial of this.unsequencedRecords.overlappingRemoves) {
                if (partial.seq > refSeq) {
                    break;
                }

                partials.addOrUpdate({ ...partial, seq: partial.localSeq, len: 0 });
            }
            // This coalesces entries with the same localSeq as well as computes overall lengths.
            cachedOverlapPartials = partials;
            this.unsequencedRecords.cachedOverlappingByRefSeq.set(refSeq, cachedOverlapPartials);
        }

        const overlap = cachedOverlapPartials.latestLeq(localSeq);
        return overlap?.len ?? 0;
    }

    public toString(glc?: (id: number) => string, indentCount = 0) {
        let buf = "";
        for (const partial of this.partialLengths.items) {
            buf += `(${partial.seq},${partial.len}) `;
        }

        // eslint-disable-next-line @typescript-eslint/no-for-in-array, no-restricted-syntax
        for (const clientId in this.clientSeqNumbers) {
            if (this.clientSeqNumbers[clientId].size > 0) {
                buf += `Client `;
                buf += glc ? `${glc(+clientId)}` : `${clientId}`;
                buf += "[";
                for (const partial of this.clientSeqNumbers[clientId].items) {
                    buf += `(${partial.seq},${partial.len})`;
                }
                buf += "]";
            }
        }
        buf = `min(seq ${this.minSeq}): ${this.minLength}; sc: ${this.segmentCount};${buf}`;
        return buf;
    }

    // Clear away partial sums for sequence numbers earlier than the current window
    private zamboni(segmentWindow: CollaborationWindow) {
        this.minLength += this.partialLengths.copyDown(segmentWindow.minSeq);
        this.minSeq = segmentWindow.minSeq;
        // eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in, no-restricted-syntax
        for (const clientId in this.clientSeqNumbers) {
            const cliPartials = this.clientSeqNumbers[clientId];
            if (cliPartials) {
                cliPartials.copyDown(segmentWindow.minSeq);
            }
        }
    }

    private addClientSeqNumber(clientId: number, seq: number, seglen: number) {
        this.clientSeqNumbers[clientId] ??= new PartialSequenceLengthsSet();
        const cli = this.clientSeqNumbers[clientId];
        cli.addOrUpdate({ seq, len: 0, seglen });
    }

    // Assumes sequence number already coalesced and that this is called in increasing `seq` order.
    private addClientSeqNumberFromPartial(partialLength: PartialSequenceLength) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.addClientSeqNumber(partialLength.clientId!, partialLength.seq, partialLength.seglen);
        if (partialLength.overlapRemoveClients) {
            partialLength.overlapRemoveClients.map((oc: Property<number, IOverlapClient>) => {
                // Original client entry was handled above
                if (partialLength.clientId !== oc.data.clientId) {
                    this.addClientSeqNumber(oc.data.clientId, partialLength.seq, oc.data.seglen);
                }
                return true;
            });
        }
    }

    private cliLatestLEQ(clientId: number, refSeq: number): PartialSequenceLength | undefined {
        return this.clientSeqNumbers[clientId]?.latestLeq(refSeq);
    }

    private cliLatest(clientId: number) {
        const cliSeqs = this.clientSeqNumbers[clientId];
        return cliSeqs && (cliSeqs.size > 0) ? cliSeqs.size - 1 : -1;
    }
}

/* eslint-disable @typescript-eslint/dot-notation */
function verifyPartialLengths(
    partialSeqLengths: PartialSequenceLengths,
    partialLengths: PartialSequenceLengthsSet,
    clientPartials: boolean,
) {
    if (partialLengths.size === 0) { return 0; }

    let lastSeqNum = 0;
    let accumSegLen = 0;
    let count = 0;

    for (const partialLength of partialLengths.items) {
        // Count total number of partial length
        count++;

        // Sequence number should be larger or equal to minseq
        assert(partialSeqLengths.minSeq <= partialLength.seq, 0x054 /* "Sequence number less than minSeq!" */);

        // Sequence number should be sorted
        assert(lastSeqNum < partialLength.seq, 0x055 /* "Sequence number is not sorted!" */);
        lastSeqNum = partialLength.seq;

        // Len is a accumulation of all the seglen adjustments
        accumSegLen += partialLength.seglen;
        if (accumSegLen !== partialLength.len) {
            assert(false, 0x056 /* "Unexpected total for accumulation of all seglen adjustments!" */);
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

        if (partialLength.overlapRemoveClients) {
            // Only the flat partialLengths can have overlapRemoveClients, the per client view shouldn't
            assert(!clientPartials, 0x058 /* "Both overlapRemoveClients and clientPartials are set!" */);

            // Each overlap client count as one, but the first remove to sequence was already counted.
            // (this aligns with the logic to omit the removing client in `addClientSeqNumberFromPartial`)
            count += partialLength.overlapRemoveClients.size() - 1;
        }
    }
    return count;
}

function verify(partialSeqLengths: PartialSequenceLengths) {
    if (partialSeqLengths["clientSeqNumbers"]) {
        let cliCount = 0;
        for (const cliSeq of partialSeqLengths["clientSeqNumbers"]) {
            if (cliSeq) {
                cliCount += verifyPartialLengths(partialSeqLengths, cliSeq, true);
            }
        }

        // If we have client view, we should have the flat view
        assert(!!partialSeqLengths["partialLengths"], 0x059 /* "Client view exists but flat view does not!" */);
        const flatCount = verifyPartialLengths(partialSeqLengths, partialSeqLengths["partialLengths"], false);

        // The number of partial lengths on the client view and flat view should be the same
        assert(flatCount === cliCount,
            0x05a /* "Mismatch between number of partial lengths on client and flat views!" */);
    } else {
        // If we don't have a client view, we shouldn't have the flat view either
        assert(!partialSeqLengths["partialLengths"], 0x05b /* "Flat view exists but client view does not!" */);
    }
}
/* eslint-enable @typescript-eslint/dot-notation */

/**
 * Clones an `overlapRemoveClients` red-black tree.
 */
function cloneOverlapRemoveClients(
    oldTree: RedBlackTree<number, IOverlapClient> | undefined,
): RedBlackTree<number, IOverlapClient> | undefined {
    if (!oldTree) { return undefined; }
    const newTree = new RedBlackTree<number, IOverlapClient>(compareNumbers);
    oldTree.map((bProp: Property<number, IOverlapClient>) => {
        newTree.put(bProp.data.clientId, { ...bProp.data });
        return true;
    });
    return newTree;
}

/**
 * Combines the `overlapRemoveClients` field of two `PartialSequenceLength` objects,
 * modifying the first PartialSequenceLength's bookkeeping in-place.
 *
 * Combination is performed additively on `seglen` on a per-client basis.
 */
export function combineOverlapClients(a: PartialSequenceLength, b: PartialSequenceLength) {
    const overlapRemoveClientsA = a.overlapRemoveClients;
    if (overlapRemoveClientsA) {
        if (b.overlapRemoveClients) {
            b.overlapRemoveClients.map((bProp: Property<number, IOverlapClient>) => {
                const aProp = overlapRemoveClientsA.get(bProp.key);
                if (aProp) {
                    aProp.data.seglen += bProp.data.seglen;
                } else {
                    overlapRemoveClientsA.put(bProp.data.clientId, { ...bProp.data });
                }
                return true;
            });
        }
    } else {
        a.overlapRemoveClients = cloneOverlapRemoveClients(b.overlapRemoveClients);
    }
}

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
            overlapRemoveClients: cloneOverlapRemoveClients(partialLength.overlapRemoveClients),
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
            this.nextSmallestIndex = new Array(sublists.length);
            for (let i = 0; i < sublists.length; i++) {
                this.nextSmallestIndex[i] = 0;
            }
        }

        public next(): { value: T; done: false; } | { value: undefined; done: true; } {
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

function insertIntoList<T>(list: T[], index: number, elem: T): void {
    if (index < list.length) {
        for (let k = list.length; k > index; k--) {
            list[k] = list[k - 1];
        }
        list[index] = elem;
    } else {
        list.push(elem);
    }
}
