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

interface IOverlapClient {
    clientId: number;
    seglen: number;
}

/**
 * Returns the partial length whose sequence number is
 * the greatest sequence number within a that is
 * less than or equal to key.
 * @param a - array of partial segment lengths
 * @param key - sequence number
 */
function latestLEQ(a: PartialSequenceLength[], key: number) {
    let best = -1;
    let lo = 0;
    let hi = a.length - 1;
    while (lo <= hi) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (a[mid].seq <= key) {
            if ((best < 0) || (a[best].seq < a[mid].seq)) {
                best = mid;
            }
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
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
     */
    public static combine(block: IMergeBlock, collabWindow: CollaborationWindow, recur = false) {
        const leafPartialLengths = PartialSequenceLengths.fromLeaves(block, collabWindow);

        let hasInternalChild = false;
        const childPartials: PartialSequenceLengths[] = [];
        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            if (!child.isLeaf()) {
                hasInternalChild = true;
                if (recur) {
                    child.partialLengths =
                        PartialSequenceLengths.combine(child, collabWindow, true);
                }
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                childPartials.push(child.partialLengths!);
            }
        }

        // If there are no internal children, the PartialSequenceLengths returns from `fromLeaves` is exactly correct.
        // Otherwise, we must additively combine all of the children partial lengths to get this block's totals.
        const combinedPartialLengths
            = hasInternalChild ? new PartialSequenceLengths(collabWindow.minSeq) : leafPartialLengths;
        if (hasInternalChild) {
            if (leafPartialLengths.partialLengths.length > 0) {
                // Some children were leaves; add combined partials from these segments
                childPartials.push(leafPartialLengths);
            }

            const childPartialsLen = childPartials.length;

            const childPartialLengths: PartialSequenceLength[][] = [];
            for (let i = 0; i < childPartialsLen; i++) {
                const { segmentCount, minLength, partialLengths } = childPartials[i];
                combinedPartialLengths.segmentCount += segmentCount;
                combinedPartialLengths.minLength += minLength;
                childPartialLengths.push(partialLengths);
            }

            // All child PartialSequenceLengths are now sorted temporally (i.e. by seq). Since
            // a given MergeTree operation can affect multiple segments, there may be multiple entries
            // for a given seq. We run through them in order, coalescing all length information for a given
            // seq together into `combinedPartialLengths`.
            let currentPartial: PartialSequenceLength | undefined;
            for (const partialLength of mergeSortedListsBySeq(childPartialLengths)) {
                if (!currentPartial || currentPartial.seq !== partialLength.seq) {
                    // Start a new seq entry.
                    currentPartial = {
                        ...partialLength,
                        len: (currentPartial?.len ?? 0) + partialLength.seglen,
                        overlapRemoveClients: cloneOverlapRemoveClients(partialLength.overlapRemoveClients),
                    };
                    combinedPartialLengths.partialLengths.push(currentPartial);
                } else {
                    // Update existing entry
                    currentPartial.seglen += partialLength.seglen;
                    currentPartial.len += partialLength.seglen;
                    combineOverlapClients(currentPartial, partialLength);
                }
            }

            for (const partial of combinedPartialLengths.partialLengths) {
                combinedPartialLengths.addClientSeqNumberFromPartial(partial);
            }
        }
        // TODO: incremental zamboni during build
        if (PartialSequenceLengths.options.zamboni) {
            combinedPartialLengths.zamboni(collabWindow);
        }

        if (PartialSequenceLengths.options.verify) {
            combinedPartialLengths.verify();
        }

        return combinedPartialLengths;
    }

    /**
     * @returns a PartialSequenceLengths structure which tracks only lengths of leaf children of the provided
     * IMergeBlock.
     */
    private static fromLeaves(block: IMergeBlock, collabWindow: CollaborationWindow): PartialSequenceLengths {
        const combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
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
                    if (segment.seq !== UnassignedSequenceNumber) {
                        PartialSequenceLengths.insertSegment(combinedPartialLengths, segment);
                    }
                }
                const removalInfo = toRemovalInfo(segment);
                if (seqLTE(removalInfo?.removedSeq, collabWindow.minSeq)) {
                    combinedPartialLengths.minLength -= segment.cachedLength;
                } else {
                    if (removalInfo !== undefined
                        && removalInfo.removedSeq !== UnassignedSequenceNumber) {
                        PartialSequenceLengths.insertSegment(
                            combinedPartialLengths,
                            segment,
                            removalInfo);
                    }
                }
            }
        }
        // Post-process correctly-ordered partials computing sums and creating
        // lists for each present client id
        const seqPartials = combinedPartialLengths.partialLengths;
        const seqPartialsLen = seqPartials.length;

        let prevLen = 0;
        for (let i = 0; i < seqPartialsLen; i++) {
            seqPartials[i].len = prevLen + seqPartials[i].seglen;
            prevLen = seqPartials[i].len;
            combinedPartialLengths.addClientSeqNumberFromPartial(seqPartials[i]);
        }
        if (PartialSequenceLengths.options.verify) {
            combinedPartialLengths.verify();
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
     */
    private static insertSegment(
        combinedPartialLengths: PartialSequenceLengths,
        segment: ISegment,
        removalInfo?: IRemovalInfo) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        let seq = segment.seq!;
        let segmentLen = segment.cachedLength;
        let clientId = segment.clientId;
        let removeClientOverlap: number[] | undefined;

        if (removalInfo) {
            seq = removalInfo.removedSeq;
            segmentLen = -segmentLen;
            // this code still assume removed client id and
            // overlap clients are separate. so we need to pull
            // then apart first.
            clientId = removalInfo.removedClientIds[0];
            removeClientOverlap = removalInfo.removedClientIds.length > 1
                ? removalInfo.removedClientIds.slice(1)
                : undefined;
        }

        const seqPartials = combinedPartialLengths.partialLengths;
        const seqPartialsLen = seqPartials.length;
        // Find the first entry with sequence number greater or equal to seq
        let indexFirstGTE = 0;
        for (; indexFirstGTE < seqPartialsLen; indexFirstGTE++) {
            if (seqPartials[indexFirstGTE].seq >= seq) {
                break;
            }
        }
        let partialLengthEntry: PartialSequenceLength | undefined
            = seqPartials[indexFirstGTE]?.seq === seq ? seqPartials[indexFirstGTE] : undefined;
        if (partialLengthEntry !== undefined) {
            // Existing entry at this seq--this occurs for ops that insert/delete more than one segment.
            partialLengthEntry.seglen += segmentLen;
            if (removeClientOverlap) {
                PartialSequenceLengths.accumulateRemoveClientOverlap(
                    seqPartials[indexFirstGTE],
                    removeClientOverlap,
                    segmentLen);
            }
        } else {
            partialLengthEntry = {
                seq,
                clientId,
                len: 0,
                seglen: segmentLen,
                overlapRemoveClients: removeClientOverlap
                    ? PartialSequenceLengths.getOverlapClients(removeClientOverlap, segmentLen)
                    : undefined,
            };
            if (indexFirstGTE < seqPartialsLen) {
                // Shift entries with greater sequence numbers
                // TODO: investigate performance improvement using BST
                for (let k = seqPartialsLen; k > indexFirstGTE; k--) {
                    seqPartials[k] = seqPartials[k - 1];
                }
                seqPartials[indexFirstGTE] = partialLengthEntry;
            } else {
                seqPartials.push(partialLengthEntry);
            }
        }
    }

    private static addSeq(partialLengths: PartialSequenceLength[], seq: number, seqSeglen: number, clientId?: number) {
        let seqPartialLen: PartialSequenceLength | undefined;
        let penultPartialLen: PartialSequenceLength | undefined;
        let leqIndex = latestLEQ(partialLengths, seq);
        if (leqIndex >= 0) {
            const pLen = partialLengths[leqIndex];
            if (pLen.seq === seq) {
                seqPartialLen = pLen;
                leqIndex = latestLEQ(partialLengths, seq - 1);
                if (leqIndex >= 0) {
                    penultPartialLen = partialLengths[leqIndex];
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
            partialLengths.push(seqPartialLen);
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
    private readonly partialLengths: PartialSequenceLength[] = [];

    /**
     * clientSeqNumbers[clientId] is a list of partial lengths for sequenced ops which either:
     * - were submitted by `clientId`.
     * - deleted a range containing segments that were concurrently deleted by `clientId`
     *
     * The second case is referred to as the "overlapping delete" case. It is necessary to avoid double-counting
     * the removal of those segments in queries including clientId.
     */
    private readonly clientSeqNumbers: PartialSequenceLength[][] = [];

    constructor(
        /**
         * The minimumSequenceNumber as defined by the collab window used in the last call to `update`,
         * or if no such calls have been made, the one used on construction.
        */
        public minSeq: number) { }

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
                const seqIndex = latestLEQ(partialLengths, seq);
                if (seqIndex >= 0) {
                    const leqPartial = partialLengths[seqIndex];
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

        PartialSequenceLengths.addSeq(this.partialLengths, seq, seqSeglen, clientId);
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        PartialSequenceLengths.addSeq(this.clientSeqNumbers[clientId], seq, seqSeglen);
        if (PartialSequenceLengths.options.zamboni) {
            this.zamboni(collabWindow);
        }
        if (PartialSequenceLengths.options.verify) {
            this.verify();
        }
    }

    public getPartialLength(refSeq: number, clientId: number) {
        let pLen = this.minLength;
        const seqIndex = latestLEQ(this.partialLengths, refSeq);
        const cliLatestIndex = this.cliLatest(clientId);
        const cliSeq = this.clientSeqNumbers[clientId];
        if (seqIndex >= 0) {
            // Add the partial length up to refSeq
            pLen += this.partialLengths[seqIndex].len;

            if (cliLatestIndex >= 0) {
                const cliLatest = cliSeq[cliLatestIndex];

                if (cliLatest.seq > refSeq) {
                    // The client has local edits after refSeq, add in the length adjustments
                    pLen += cliLatest.len;
                    const precedingCliIndex = this.cliLatestLEQ(clientId, refSeq);
                    if (precedingCliIndex >= 0) {
                        // Subtract out double-counted lengths: segments still in the collab window but before
                        // the refSeq submitted by the client we're querying for were counted in each addition above.
                        pLen -= cliSeq[precedingCliIndex].len;
                    }
                }
            }
        } else {
            // RefSeq is before any of the partial lengths
            // so just add in all local edits of that client (which should all be after the refSeq)
            if (cliLatestIndex >= 0) {
                const cliLatest = cliSeq[cliLatestIndex];
                pLen += cliLatest.len;
            }
        }
        return pLen;
    }

    public toString(glc?: (id: number) => string, indentCount = 0) {
        let buf = "";
        for (const partial of this.partialLengths) {
            buf += `(${partial.seq},${partial.len}) `;
        }

        // eslint-disable-next-line @typescript-eslint/no-for-in-array, no-restricted-syntax
        for (const clientId in this.clientSeqNumbers) {
            if (this.clientSeqNumbers[clientId].length > 0) {
                buf += `Client `;
                if (glc) {
                    buf += `${glc(+clientId)}`;
                } else {
                    buf += `${clientId}`;
                }
                buf += "[";
                for (const partial of this.clientSeqNumbers[clientId]) {
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
        function copyDown(partialLengths: PartialSequenceLength[]) {
            const mindex = latestLEQ(partialLengths, segmentWindow.minSeq);
            let minLength = 0;
            if (mindex >= 0) {
                minLength = partialLengths[mindex].len;
                const seqCount = partialLengths.length;
                if (mindex <= (seqCount - 1)) {
                    // Still some entries remaining
                    const remainingCount = (seqCount - mindex) - 1;
                    // Copy down
                    for (let i = 0; i < remainingCount; i++) {
                        partialLengths[i] = partialLengths[i + mindex + 1];
                        partialLengths[i].len -= minLength;
                    }
                    partialLengths.length = remainingCount;
                }
            }
            return minLength;
        }
        this.minLength += copyDown(this.partialLengths);
        this.minSeq = segmentWindow.minSeq;
        // eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in, no-restricted-syntax
        for (const clientId in this.clientSeqNumbers) {
            const cliPartials = this.clientSeqNumbers[clientId];
            if (cliPartials) {
                copyDown(cliPartials);
            }
        }
    }

    private addClientSeqNumber(clientId: number, seq: number, seglen: number) {
        if (this.clientSeqNumbers[clientId] === undefined) {
            this.clientSeqNumbers[clientId] = [];
        }
        const cli = this.clientSeqNumbers[clientId];
        let pLen = seglen;
        if (cli.length > 0) {
            pLen += cli[cli.length - 1].len;
        }
        cli.push({ seq, len: pLen, seglen });
    }

    // Assumes sequence number already coalesced and that this is called in increasing `seq` order.
    private addClientSeqNumberFromPartial(partialLength: PartialSequenceLength) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.addClientSeqNumber(partialLength.clientId!, partialLength.seq, partialLength.seglen);
        if (partialLength.overlapRemoveClients) {
            partialLength.overlapRemoveClients.map((oc: Property<number, IOverlapClient>) => {
                this.addClientSeqNumber(oc.data.clientId, partialLength.seq, oc.data.seglen);
                return true;
            });
        }
    }

    private cliLatestLEQ(clientId: number, refSeq: number) {
        const cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs) {
            return latestLEQ(cliSeqs, refSeq);
        } else {
            return -1;
        }
    }

    private cliLatest(clientId: number) {
        const cliSeqs = this.clientSeqNumbers[clientId];
        if (cliSeqs && (cliSeqs.length > 0)) {
            return cliSeqs.length - 1;
        } else {
            return -1;
        }
    }

    // Debug only
    private verifyPartialLengths(partialLengths: PartialSequenceLength[], clientPartials: boolean) {
        if (partialLengths.length === 0) { return 0; }

        let lastSeqNum = 0;
        let accumSegLen = 0;
        let count = 0;

        for (const partialLength of partialLengths) {
            // Count total number of partial length
            count++;

            // Sequence number should be larger or equal to minseq
            assert(this.minSeq <= partialLength.seq, 0x054 /* "Sequence number less than minSeq!" */);

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
                if (this.minLength + partialLength.len < 0) {
                    assert(false, 0x057 /* "Negative length after length adjustment!" */);
                }
            }

            if (partialLength.overlapRemoveClients) {
                // Only the flat partialLengths can have overlapRemoveClients, the per client view shouldn't
                assert(!clientPartials, 0x058 /* "Both overlapRemoveClients and clientPartials are set!" */);

                // Each overlap client count as one
                count += partialLength.overlapRemoveClients.size();
            }
        }
        return count;
    }

    private verify() {
        if (this.clientSeqNumbers) {
            let cliCount = 0;
            for (const cliSeq of this.clientSeqNumbers) {
                if (cliSeq) {
                    cliCount += this.verifyPartialLengths(cliSeq, true);
                }
            }

            // If we have client view, we should have the flat view
            assert(!!this.partialLengths, 0x059 /* "Client view exists but flat view does not!" */);
            const flatCount = this.verifyPartialLengths(this.partialLengths, false);

            // The number of partial lengths on the client view and flat view should be the same
            assert(flatCount === cliCount,
                0x05a /* "Mismatch between number of partial lengths on client and flat views!" */);
        } else {
            // If we don't have a client view, we shouldn't have the flat view either
            assert(!this.partialLengths, 0x05b /* "Flat view exists but client view does not!" */);
        }
    }
}

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
function combineOverlapClients(a: PartialSequenceLength, b: PartialSequenceLength) {
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
 * Given a collection of PartialSequenceLength lists--each sorted by sequence number--returns an iterable that yields
 * each PartialSequenceLength in sequence order.
 *
 * This is equivalent to flattening the input list and sorting it by sequence number. If the number of lists to merge is
 * a constant, however, this approach is advantageous asymptotically.
 */
function mergeSortedListsBySeq(lists: PartialSequenceLength[][]): Iterable<PartialSequenceLength> {
    class PartialSequenceLengthIterator {
        /**
         * nextSmallestIndex[i] is the next element of sublists[i] to check.
         * In other words, the iterator has already yielded elements of sublists[i] *up through*
         * sublists[i][nextSmallestIndex[i] - 1].
         */
        private readonly nextSmallestIndex: number[];

        constructor(private readonly sublists: PartialSequenceLength[][]) {
            this.nextSmallestIndex = new Array(sublists.length);
            for (let i = 0; i < sublists.length; i++) {
                this.nextSmallestIndex[i] = 0;
            }
        }

        public next(): { value: PartialSequenceLength; done: false; } | { value: undefined; done: true; } {
            const len = this.sublists.length;
            let currentMin: PartialSequenceLength | undefined;
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
