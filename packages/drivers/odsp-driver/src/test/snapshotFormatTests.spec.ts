/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { stringToBuffer } from "@fluidframework/common-utils";
import { SnapshotFormatConverter } from "../snapshotFormatConverter";
import { ISequencedDeltaOpMessage } from "../contracts";

const snapshotTree: ISnapshotTree = {
    id: "id",
    blobs: {},
    commits: {},
    trees: {
        ".protocol": {
                id: "id",
                blobs: {
                attributes: "bARADgIe4qmDjJl2l2zz12IM3",
                quorumMembers: "bARBkx1nses1pHL1vKnmFUfIC",
                quorumProposals: "bARBkx1nses1pHL1vKnmFUfIC",
                },
                commits: {},
                trees: {},
        },
        ".app": {
                id: "id",
                blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
                commits: {},
                trees: {
                    ".channels": {
                            id: "id",
                            blobs: {},
                            commits: {},
                            trees: {
                                default: {
                                        id: "id",
                                        blobs: {
                                            ".component": "bARC6dCXlcrPxQHw3PeROtmKc",
                                            "gc": "bARDNMoBed+nKrsf04id52iUA",
                                        },
                                        commits: {},
                                        trees: {
                                            ".channels": {
                                                id: "id",
                                                blobs: {},
                                                commits: {},
                                                trees: {
                                                    root: { id: "id", blobs: {}, commits: {}, trees: {} },
                                                },
                                            },
                                        },
                                },
                            },
                    },
                    ".blobs": { id: "id", blobs: {}, commits: {}, trees: {} },
                },
        },
    },
};

const blobs = new Map<string, Uint8Array>(
    [
        ["bARADgIe4qmDjJl2l2zz12IM3",
            new Uint8Array(stringToBuffer(JSON.stringify({branch:"",minimumSequenceNumber:0,sequenceNumber:0,term:1}), "utf8"))],
        ["bARBkx1nses1pHL1vKnmFUfIC", new Uint8Array(stringToBuffer(JSON.stringify([]), "utf8"))],
        ["bARD4RKvW4LL1KmaUKp6hUMSp", new Uint8Array(stringToBuffer(JSON.stringify({summaryFormatVersion:1,gcFeature:0}), "utf8"))],
        ["bARC6dCXlcrPxQHw3PeROtmKc",
            new Uint8Array(stringToBuffer(JSON.stringify({pkg:"[\"@fluid-example/smde\"]",summaryFormatVersion:2,isRootDataStore:true}), "utf8"))],
        ["bARDNMoBed+nKrsf04id52iUA", new Uint8Array(stringToBuffer(JSON.stringify(
            {usedRoutes:[""],gcData:{gcNodes:{"/root":["/default/01b197a2-0432-413b-b2c9-83a992b804c4","/default"],"/01b197a2-0432-413b-b2c9-83a992b804c4":["/default"],"/":["/default/root","/default/01b197a2-0432-413b-b2c9-83a992b804c4"]}}}), "utf8"))],
    ],
);

const ops: ISequencedDeltaOpMessage[] = [
    {
        sequenceNumber: 1,
        op: {
        clientId: "X",
        clientSequenceNumber: -1,
        contents: null,
        minimumSequenceNumber: 0,
        referenceSequenceNumber: -1,
        sequenceNumber: 1,
        term: 1,
        timestamp: 1623883807452,
        type: "join",
        },
    },
    {
        sequenceNumber: 2,
        op: {
            clientId: "Y",
            clientSequenceNumber: -1,
            contents: null,
            minimumSequenceNumber: 0,
            referenceSequenceNumber: -1,
            sequenceNumber: 2,
            term: 1,
            timestamp: 1623883811928,
            type: "join",
        },
    },
];

describe("Snapshot Format Conversion Tests", () => {
    it("Conversion test", async () => {
        const snapshotFormatConverter = new SnapshotFormatConverter();
        const compactSnapshot =
            snapshotFormatConverter.convertOdspSnapshotToCompactSnapshot(snapshotTree, blobs, 0, ops);
        const result = snapshotFormatConverter.convertBinaryFormatToOdspSnapshot(compactSnapshot);
        assert.deepStrictEqual(result.tree, snapshotTree, "Tree structure should match");
        assert.deepStrictEqual(result.blobs, blobs, "Blobs content should match");
        assert.deepStrictEqual(result.ops, ops, "Ops should match");

        // Convert to compact snapshot again and then match to previous one.
        const compactSnapshot2 =
            snapshotFormatConverter.convertOdspSnapshotToCompactSnapshot(result.tree, result.blobs, 0, result.ops);
        assert.deepStrictEqual(compactSnapshot2.buffer, compactSnapshot.buffer,
            "Compact representation should remain same");
    });
});
