/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Property } from "./base";
import { RedBlackTree } from "./collections";
import { UnassignedSequenceNumber } from "./constants";
import {
    CollaborationWindow,
    compareNumbers,
    IMergeBlock,
    IRemovalInfo,
    ISegment,
    MergeTree,
} from "./mergeTree";

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

export interface PartialSequenceLength {
    seq: number;
    len: number;
    seglen: number;
    clientId?: number;
    overlapRemoveClients?: RedBlackTree<number, IOverlapClient>;
}

/**
 * Keep track of partial sums of segment lengths for all sequence numbers
 * in the current collaboration window (if any).  Only used during active
 * collaboration.
 */
export class PartialSequenceLengths {
    public static options = {
        verify: false,
        zamboni: true,
    };

    public static combine(mergeTree: MergeTree, block: IMergeBlock, collabWindow: CollaborationWindow, recur = false) {
        return PartialSequenceLengths.combineBranch(mergeTree, block, collabWindow, recur);
    }

    /**
     * Combine the partial lengths of block's children
     * @param block - an interior node; it is assumed that each interior node child of this block
     * has its partials up to date
     * @param collabWindow - segment window of the segment tree containing textSegmentBlock
     */
    private static combineBranch(
        mergeTree: MergeTree,
        block: IMergeBlock,
        collabWindow: CollaborationWindow,
        recur = false) {
        let combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
        PartialSequenceLengths.fromLeaves(mergeTree, combinedPartialLengths, block, collabWindow);
        let prevPartial: PartialSequenceLength | undefined;

        function cloneOverlapRemoveClients(oldTree: RedBlackTree<number, IOverlapClient> | undefined) {
            if (!oldTree) { return undefined; }
            const newTree = new RedBlackTree<number, IOverlapClient>(compareNumbers);
            oldTree.map((bProp: Property<number, IOverlapClient>) => {
                newTree.put(bProp.data.clientId, { ...bProp.data });
                return true;
            });
            return newTree;
        }

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

        function addNext(partialLength: PartialSequenceLength) {
            const seq = partialLength.seq;
            let pLen = 0;

            if (prevPartial) {
                if (prevPartial.seq === partialLength.seq) {
                    prevPartial.seglen += partialLength.seglen;
                    prevPartial.len += partialLength.seglen;
                    combineOverlapClients(prevPartial, partialLength);
                    return;
                } else {
                    pLen = prevPartial.len;
                    // Previous sequence number is finished
                    combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
                }
            }
            prevPartial = {
                clientId: partialLength.clientId,
                len: pLen + partialLength.seglen,
                overlapRemoveClients: cloneOverlapRemoveClients(partialLength.overlapRemoveClients),
                seglen: partialLength.seglen,
                seq,
            };
            combinedPartialLengths.partialLengths.push(prevPartial);
        }

        const childPartials: PartialSequenceLengths[] = [];
        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            if (!child.isLeaf()) {
                const childBlock = child;
                if (recur) {
                    childBlock.partialLengths =
                        PartialSequenceLengths.combine(mergeTree, childBlock, collabWindow, true);
                }
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                childPartials.push(childBlock.partialLengths!);
            }
        }
        let childPartialsLen = childPartials.length;
        if (childPartialsLen !== 0) {
            // Some children are interior nodes
            if (combinedPartialLengths.partialLengths.length > 0) {
                // Some children were leaves; add combined partials from these segments
                childPartials.push(combinedPartialLengths);
                childPartialsLen++;
                combinedPartialLengths = new PartialSequenceLengths(collabWindow.minSeq);
            }
            const indices = new Array<number>(childPartialsLen);
            const childPartialsCounts = new Array<number>(childPartialsLen);
            for (let i = 0; i < childPartialsLen; i++) {
                indices[i] = 0;
                childPartialsCounts[i] = childPartials[i].partialLengths.length;
                combinedPartialLengths.minLength += childPartials[i].minLength;
                combinedPartialLengths.segmentCount += childPartials[i].segmentCount;
            }
            let outerIndexOfEarliest = 0;
            let earliestPartialLength: PartialSequenceLength;
            while (outerIndexOfEarliest >= 0) {
                outerIndexOfEarliest = -1;
                for (let k = 0; k < childPartialsLen; k++) {
                    // Find next earliest sequence number
                    if (indices[k] < childPartialsCounts[k]) {
                        const cpLen = childPartials[k].partialLengths[indices[k]];

                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        if ((outerIndexOfEarliest < 0) || (cpLen.seq < earliestPartialLength!.seq)) {
                            outerIndexOfEarliest = k;
                            earliestPartialLength = cpLen;
                        }
                    }
                }
                if (outerIndexOfEarliest >= 0) {

                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    addNext(earliestPartialLength!);
                    indices[outerIndexOfEarliest]++;
                }
            }
            // Add client entry for last partial, if any
            if (prevPartial) {
                combinedPartialLengths.addClientSeqNumberFromPartial(prevPartial);
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

    private static fromLeaves(
        mergeTree: MergeTree, combinedPartialLengths: PartialSequenceLengths,
        block: IMergeBlock, collabWindow: CollaborationWindow) {
        combinedPartialLengths.minLength = 0;
        combinedPartialLengths.segmentCount = block.childCount;

        function seqLTE(seq: number, minSeq: number) {
            return (seq !== UnassignedSequenceNumber) && (seq <= minSeq);
        }

        for (let i = 0; i < block.childCount; i++) {
            const child = block.children[i];
            if (child.isLeaf()) {
                // Leaf segment
                const segment = child;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (seqLTE(segment.seq!, collabWindow.minSeq)) {
                    combinedPartialLengths.minLength += segment.cachedLength;
                } else {
                    if (segment.seq !== UnassignedSequenceNumber) {
                        PartialSequenceLengths.insertSegment(combinedPartialLengths, segment);
                    }
                }
                const removalInfo: IRemovalInfo = segment;
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                if (seqLTE(removalInfo.removedSeq!, collabWindow.minSeq)) {
                    combinedPartialLengths.minLength -= segment.cachedLength;
                } else {
                    if ((removalInfo.removedSeq !== undefined) &&
                        (removalInfo.removedSeq !== UnassignedSequenceNumber)) {
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            seq = removalInfo.removedSeq!;
            segmentLen = -segmentLen;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientId = removalInfo.removedClientId!;
            if (removalInfo.removedClientOverlap) {
                removeClientOverlap = removalInfo.removedClientOverlap;
            }
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
        if ((indexFirstGTE < seqPartialsLen) && (seqPartials[indexFirstGTE].seq === seq)) {
            seqPartials[indexFirstGTE].seglen += segmentLen;
            if (removeClientOverlap) {
                PartialSequenceLengths.accumulateRemoveClientOverlap(
                    seqPartials[indexFirstGTE],
                    removeClientOverlap,
                    segmentLen);
            }
        } else {
            let pLen: PartialSequenceLength;
            if (removeClientOverlap) {
                const overlapClients = PartialSequenceLengths.getOverlapClients(removeClientOverlap, segmentLen);
                pLen = { seq, clientId, len: 0, seglen: segmentLen, overlapRemoveClients: overlapClients };
            } else {
                pLen = { seq, clientId, len: 0, seglen: segmentLen };
            }

            if (indexFirstGTE < seqPartialsLen) {
                // Shift entries with greater sequence numbers
                // TODO: investigate performance improvement using BST
                for (let k = seqPartialsLen; k > indexFirstGTE; k--) {
                    seqPartials[k] = seqPartials[k - 1];
                }
                seqPartials[indexFirstGTE] = pLen;
            } else {
                seqPartials.push(pLen);
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
        if (seqPartialLen === undefined) {

            seqPartialLen = {
                clientId,
                seglen: seqSeglen,
                seq,
            } as PartialSequenceLength;
            partialLengths.push(seqPartialLen);
        } else {
            seqPartialLen.seglen = seqSeglen;
            // Assert client id matches
        }
        if (penultPartialLen !== undefined) {
            seqPartialLen.len = seqPartialLen.seglen + penultPartialLen.len;
        } else {
            seqPartialLen.len = seqPartialLen.seglen;
        }
    }
    public minLength = 0;
    public segmentCount = 0;
    public partialLengths: PartialSequenceLength[] = [];
    public clientSeqNumbers: PartialSequenceLength[][] = [];

    constructor(public minSeq: number) {
    }

    // Assume: seq is latest sequence number; no structural change to sub-tree, but a segment
    // with sequence number seq has been added within the sub-tree
    // TODO: assert client id matches
    public update(
        mergeTree: MergeTree,
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
                const removalInfo: IRemovalInfo = segment;

                if (segment.seq === seq) {
                    if (removalInfo.removedSeq !== seq) {
                        seqSeglen += segment.cachedLength;
                    }
                } else {
                    if (removalInfo.removedSeq === seq) {
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

        // eslint-disable-next-line @typescript-eslint/no-for-in-array
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
        // eslint-disable-next-line @typescript-eslint/no-for-in-array, guard-for-in
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

    // Assumes sequence number already coalesced
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
