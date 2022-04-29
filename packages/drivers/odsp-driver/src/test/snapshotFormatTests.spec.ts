/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { strict as assert } from "assert";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { stringToBuffer } from "@fluidframework/common-utils";
import { parseCompactSnapshotResponse } from "../compactSnapshotParser";
import { convertToCompactSnapshot } from "../compactSnapshotWriter";
import { ISnapshotContents } from "../odspUtils";

const snapshotTree: ISnapshotTree = {
    id: "SnapshotId",
    blobs: {},
    trees: {
        ".protocol": {
            blobs: {
                attributes: "bARADgIe4qmDjJl2l2zz12IM3",
                quorumMembers: "bARBkx1nses1pHL1vKnmFUfIC",
                quorumProposals: "bARBkx1nses1pHL1vKnmFUfIC",
            },
            trees: {},
        },
        ".app": {
                blobs: { ".metadata": "bARD4RKvW4LL1KmaUKp6hUMSp" },
                trees: {
                    ".channels": {
                        blobs: {},
                        trees: {
                            default: {
                                    blobs: {
                                        ".component": "bARC6dCXlcrPxQHw3PeROtmKc",
                                        "gc": "bARDNMoBed+nKrsf04id52iUA",
                                    },
                                    trees: {
                                        ".channels": {
                                            blobs: {},
                                            trees: {
                                                root: { blobs: {}, trees: {} },
                                            },
                                        },
                                    },
                            },
                        },
                        unreferenced: true,
                    },
                    ".blobs": { blobs: {}, trees: {} },
                },
                unreferenced: true,
        },
    },
};

const blobs = new Map<string, ArrayBuffer>(
    [
        ["bARADgIe4qmDjJl2l2zz12IM3",
            stringToBuffer(JSON.stringify({ branch: "", minimumSequenceNumber: 0, sequenceNumber: 0, term: 1 }), "utf8")],
        ["bARBkx1nses1pHL1vKnmFUfIC", stringToBuffer(JSON.stringify([]), "utf8")],
        ["bARD4RKvW4LL1KmaUKp6hUMSp", stringToBuffer(JSON.stringify({ summaryFormatVersion: 1, gcFeature: 0 }), "utf8")],
        ["bARC6dCXlcrPxQHw3PeROtmKc",
        stringToBuffer(JSON.stringify({ pkg: "[\"@fluid-example/smde\"]", summaryFormatVersion: 2, isRootDataStore: true }), "utf8")],
        ["bARDNMoBed+nKrsf04id52iUA", stringToBuffer(JSON.stringify(
            { usedRoutes: [""], gcData: { gcNodes: { "/root": ["/default/01b197a2-0432-413b-b2c9-83a992b804c4", "/default"], "/01b197a2-0432-413b-b2c9-83a992b804c4": ["/default"], "/": ["/default/root", "/default/01b197a2-0432-413b-b2c9-83a992b804c4"] } } }), "utf8")],
    ],
);

const ops: ISequencedDocumentMessage[] = [
    {
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
    {
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
];

describe("Snapshot Format Conversion Tests", () => {
    it("Conversion test", async () => {
        const snapshotContents: ISnapshotContents = {
            snapshotTree,
            blobs,
            ops,
            sequenceNumber: 0,
        };
        const compactSnapshot = convertToCompactSnapshot(snapshotContents);
        const result = parseCompactSnapshotResponse(compactSnapshot);
        assert.deepStrictEqual(result.snapshotTree, snapshotTree, "Tree structure should match");
        assert.deepStrictEqual(result.blobs, blobs, "Blobs content should match");
        assert.deepStrictEqual(result.ops, ops, "Ops should match");
        assert(result.sequenceNumber === 0, "Seq number should match");
        assert(result.snapshotTree.id = snapshotContents.snapshotTree.id, "Snapshot id should match");
        // Convert to compact snapshot again and then match to previous one.
        const compactSnapshot2 = convertToCompactSnapshot(result);
        assert.deepStrictEqual(compactSnapshot2.buffer, compactSnapshot.buffer,
            "Compact representation should remain same");
    });
});
