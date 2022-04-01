/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { expect } from "chai";

import {
    // ISummaryBlob,
    ISummaryTree,
    SummaryType,
} from "@fluidframework/protocol-definitions";

import { getSanitizedCopy } from "../liveSummarySanitizer";

// Meta transofmrations
const orgMetaContent = {
    createContainerRuntimeVersion: "0.58.3000",
    createContainerTimestamp: 1648705098506,
    summaryCount: 79,
    summaryFormatVersion: 1,
    gcFeature: 0,
    message: {
        clientId: null,
        clientSequenceNumber: -1,
        minimumSequenceNumber: 787,
        referenceSequenceNumber: -1,
        sequenceNumber: 796,
        timestamp: 1648783470946,
        type: "leave",
    },
};

const transformedMetadata = {
    createContainerRuntimeVersion: orgMetaContent.createContainerRuntimeVersion,
    createContainerTimestamp: orgMetaContent.createContainerTimestamp,
    summaryFormatVersion: orgMetaContent.summaryFormatVersion,
};

// Summarizer transofmrations
const transformedSummarizer = {
    electionSequenceNumber: 0,
};

// Attributes transformations
const transformedAttributes = {
    sequenceNumber: 0,
    term: 1,
    minimumSequenceNumber: 0,
};

// Quorum val transormations
const quorumKey = "code";
const quorumVal = { package: "no-dynamic-package", config: {} };
const orgQuorumValContent = [
    [
        quorumKey,
        {
            key: quorumKey,
            value: quorumVal,
            approvalSequenceNumber: 10,
            commitSequenceNumber: 20,
            sequenceNumber: 17,
        },
    ],
];

const transformedQuorumValContent = [
    [
        quorumKey,
        {
            key: quorumKey,
            value: quorumVal,
            approvalSequenceNumber: 0,
            commitSequenceNumber: 0,
            sequenceNumber: 0,
        },
    ],
];

// Base root data
const rootData: ISummaryTree = {
    type: 1,
    tree: {
        ".component": {
            type: 2,
            content:
                '{"pkg":"[\\"rootDO\\"]","summaryFormatVersion":2,"isRootDataStore":true}',
        },
        ".channels": {
            type: 1,
            tree: {
                "root": {
                    type: 1,
                    tree: {
                        "header": {
                            type: 2,
                            content:
                                '{"blobs":[],"content":{"subdirectories":{"initial-objects-key":{"storage":{"map1":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/b2fd633e-91bd-45bf-ba80-6193fa3826a3"}},"map2":{"type":"Plain","value":{"type":"__fluid_handle__","url":"/rootDOId/8e317b0b-a914-4674-82c6-82ba8e32cdef"}}}}}}}',
                        },
                        ".attributes": {
                            type: 2,
                            content:
                                '{"type":"https://graph.microsoft.com/types/directory","snapshotFormatVersion":"0.1","packageVersion":"0.58.3000"}',
                        },
                    },
                },
                "b2fd633e-91bd-45bf-ba80-6193fa3826a3": {
                    type: 1,
                    tree: {
                        "header": {
                            type: 2,
                            content:
                                '{"blobs":[],"content":{"diceValue":{"type":"Plain","value":1}}}',
                        },
                        ".attributes": {
                            type: 2,
                            content:
                                '{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"0.58.3000"}',
                        },
                    },
                },
                "8e317b0b-a914-4674-82c6-82ba8e32cdef": {
                    type: 1,
                    tree: {
                        "header": {
                            type: 2,
                            content:
                                '{"blobs":[],"content":{"diceValue":{"type":"Plain","value":1}}}',
                        },
                        ".attributes": {
                            type: 2,
                            content:
                                '{"type":"https://graph.microsoft.com/types/map","snapshotFormatVersion":"0.2","packageVersion":"0.58.3000"}',
                        },
                    },
                },
            },
        },
    },
};

// Original summary
const orgTree: ISummaryTree = {
    type: 1,
    tree: {
        ".metadata": {
            type: 2,
            content: JSON.stringify(orgMetaContent),
        },
        ".electedSummarizer": {
            type: 2,
            content: '{"electionSequenceNumber":796}',
        },
        ".logTail": {
            type: 1,
            tree: {
                logTail: {
                    type: 2,
                    content:
                        '[{"clientId":"6bb88e12-4493-4f5a-a37e-b4d0c45a9776","clientSequenceNumber":1,"contents":"{\\"handle\\":\\"bO1MAAAAAAAAABgAAAA==\\",\\"head\\":\\"bBxYDAAAHAAAA\\",\\"message\\":\\"Summary @796:787\\",\\"parents\\":[\\"bBxYDAAAHAAAA\\"],\\"details\\":{\\"includesProtocolTree\\":false}}","minimumSequenceNumber":796,"referenceSequenceNumber":796,"sequenceNumber":797,"term":1,"timestamp":1648783471449,"traces":[],"type":"summarize","additionalContent":"{\\"clients\\":[{\\"canEvict\\":true,\\"clientId\\":\\"6bb88e12-4493-4f5a-a37e-b4d0c45a9776\\",\\"clientSequenceNumber\\":1,\\"lastUpdate\\":1648783471449,\\"nack\\":false,\\"referenceSequenceNumber\\":796,\\"scopes\\":[\\"doc:read\\",\\"doc:write\\",\\"summary:write\\"]}],\\"durableSequenceNumber\\":791,\\"epoch\\":11,\\"expHash1\\":\\"25b823f9\\",\\"logOffset\\":329266,\\"sequenceNumber\\":797,\\"term\\":1,\\"lastSentMSN\\":787,\\"successfullyStartedLambdas\\":[\\"Scribe\\",\\"Scribe\\",\\"Scribe\\",\\"Scribe\\",\\"Scribe\\",\\"Scribe\\"]}","expHash1":"-65335588"},{"clientId":null,"clientSequenceNumber":-1,"contents":{"handle":"bBxwDAAAHAAAA","summaryProposal":{"summarySequenceNumber":797}},"minimumSequenceNumber":796,"referenceSequenceNumber":-1,"sequenceNumber":798,"term":1,"timestamp":1648783472016,"traces":[],"type":"summaryAck","expHash1":"48ebd8f1"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":799,"referenceSequenceNumber":-1,"sequenceNumber":799,"term":1,"timestamp":1648783472121,"traces":[],"type":"leave","data":"\\"6bb88e12-4493-4f5a-a37e-b4d0c45a9776\\"","expHash1":"4c23c4cf"},{"clientId":null,"clientSequenceNumber":-1,"contents":null,"minimumSequenceNumber":800,"referenceSequenceNumber":800,"sequenceNumber":800,"term":1,"timestamp":1648783472214,"traces":[],"type":"noClient","additionalContent":"{\\"clients\\":[],\\"durableSequenceNumber\\":797,\\"epoch\\":11,\\"expHash1\\":\\"4c23c4cf\\",\\"logOffset\\":329270,\\"sequenceNumber\\":800,\\"term\\":1,\\"lastSentMSN\\":799,\\"successfullyStartedLambdas\\":[\\"Scribe\\",\\"Scribe\\",\\"Scribe\\",\\"Scribe\\",\\"Scribe\\",\\"Scribe\\"]}","expHash1":"6709e87"}]',
                },
            },
        },
        ".serviceProtocol": {
            type: 1,
            tree: {
                deli: {
                    type: 2,
                    content:
                        '{"clients":[],"durableSequenceNumber":797,"epoch":11,"expHash1":"4c23c4cf","logOffset":329270,"sequenceNumber":800,"term":1,"lastSentMSN":799,"successfullyStartedLambdas":["Scribe","Scribe","Scribe","Scribe","Scribe","Scribe"]}',
                },
                scribe: {
                    type: 2,
                    content:
                        '{"lastSummarySequenceNumber":796,"lastClientSummaryHead":"bBxwDAAAHAAAA","logOffset":217625,"minimumSequenceNumber":800,"protocolState":{"sequenceNumber":800,"minimumSequenceNumber":800,"members":[],"proposals":[],"values":[["code",{"key":"code","value":{"package":"no-dynamic-package","config":{}},"approvalSequenceNumber":0,"commitSequenceNumber":0,"sequenceNumber":0}]]},"sequenceNumber":800}',
                },
            },
        },
        ".protocol": {
            type: 1,
            tree: {
                quorumMembers: {
                    type: 2,
                    content:
                        '[["6bb88e12-4493-4f5a-a37e-b4d0c45a9776",{"client":{"details":{"capabilities":{"interactive":false},"type":"summarizer","environment":"; loaderVersion:0.58.3000"},"mode":"write","permission":[],"scopes":["doc:read","doc:write","summary:write"],"user":{"id":"5e109952-b279-4160-a8e1-d1c4b75c465e","name":"Cosmicraven Myth"},"timestamp":1648783470929},"sequenceNumber":795}]]',
                },
                quorumProposals: {
                    type: 2,
                    content: "[]",
                },
                quorumValues: {
                    type: 2,
                    content: JSON.stringify(orgQuorumValContent),
                },
                attributes: {
                    type: 2,
                    content:
                        '{"minimumSequenceNumber":787,"sequenceNumber":796,"term":1}',
                },
            },
        },
        ".app": {
            type: 1,
            tree: {},
        },
        ".channels": {
            type: 1,
            tree: {
                rootDOId: rootData,
            },
        },
    },
};

describe("Live summary sanitizer tests", () => {
    describe("General tree", () => {
        let baseTree: ISummaryTree;
        beforeEach(() => {
            baseTree = JSON.parse(JSON.stringify(orgTree));
        });

        it("it should not throw exception for valid tree", async () => {
            expect(() => getSanitizedCopy(baseTree)).to.not.throw();
        });

        it("should transform .app tree", async () => {
            const r = getSanitizedCopy(baseTree);
            expect((r as any).tree[".app"].tree[".metadata"].content).equal(
                JSON.stringify(transformedMetadata),
            );
            expect((r as any).tree[".app"].tree[".electedSummarizer"].content).equal(
                JSON.stringify(transformedSummarizer),
            );
            expect((r as any).tree[".app"].tree[".channels"].tree.rootDOId).to.deep.equal(
                rootData,
            );
        });

        it("should transform .protocol tree content", async () => {
            const r = getSanitizedCopy(baseTree);
            expect((r as any).tree[".protocol"].tree.attributes.content).equal(
                JSON.stringify(transformedAttributes),
            );
            expect(
                (r as any).tree[".protocol"].tree.quorumProposals.content,
            ).equal(JSON.stringify([]));
            expect(
                (r as any).tree[".protocol"].tree.quorumMembers.content,
            ).equal(JSON.stringify([]));
            expect(
                (r as any).tree[".protocol"].tree.quorumValues.content,
            ).equal(JSON.stringify(transformedQuorumValContent));
        });

        it("should throw if summary tree is not valid", async () => {
            (baseTree as any).tree[".metadata"].type = SummaryType.Handle;
            expect(() => getSanitizedCopy(baseTree)).to.throw("Summary tree is not valid");
        });

        it("should throw if meta data is missing", async () => {
            delete (baseTree as any).tree[".metadata"];
            expect(() => getSanitizedCopy(baseTree)).to.throw("Missing summary metadata");
        });

        it("should throw invalid summary version", async () => {
            const m = {...orgMetaContent, summaryFormatVersion: 2};
            (baseTree as any).tree[".metadata"].content = JSON.stringify(m);
            expect(() => getSanitizedCopy(baseTree)).to.throw("We can only recover through v1 summaries");
        });

        it("should throw invalid summary version", async () => {
            const m = {...orgMetaContent, summaryFormatVersion: 2};
            (baseTree as any).tree[".metadata"].content = JSON.stringify(m);
            expect(() => getSanitizedCopy(baseTree)).to.throw("We can only recover through v1 summaries");
        });
    });

    describe("Protocol tree", () => {
        let baseTree: ISummaryTree;
        beforeEach(() => {
            baseTree = JSON.parse(JSON.stringify(orgTree));
        });

        it("should throw if attributes are missing", async () => {
            delete (baseTree as any).tree[".protocol"].tree.attributes;
            expect(() => getSanitizedCopy(baseTree)).to.throw("Valid protocol tree keys should be present");
        });

        it("should throw if quorumMembers are missing", async () => {
            delete (baseTree as any).tree[".protocol"].tree.quorumMembers;
            expect(() => getSanitizedCopy(baseTree)).to.throw("Valid protocol tree keys should be present");
        });

        it("should throw if quorumProposals are missing", async () => {
            delete (baseTree as any).tree[".protocol"].tree.quorumProposals;
            expect(() => getSanitizedCopy(baseTree)).to.throw("Valid protocol tree keys should be present");
        });

        it("should throw if quorumValues are missing", async () => {
            delete (baseTree as any).tree[".protocol"].tree.quorumValues;
            expect(() => getSanitizedCopy(baseTree)).to.throw("Valid protocol tree keys should be present");
        });

        it("should throw if quorumValues content is missing", async () => {
            (baseTree as any).tree[".protocol"].tree.quorumValues.content = "{}";
            expect(() => getSanitizedCopy(baseTree)).to.throw("Invalid quorum values");
        });

        it("should throw if quorumValues content is missing", async () => {
            (baseTree as any).tree[".protocol"].tree.quorumValues.content = "[[]]";
            expect(() => getSanitizedCopy(baseTree)).to.throw("First quorum value not valid");
        });
    });

    describe("App tree", () => {
        let baseTree: ISummaryTree;
        beforeEach(() => {
            baseTree = JSON.parse(JSON.stringify(orgTree));
        });

        it("should throw if channels are missing", async () => {
            delete (baseTree as any).tree[".channels"];
            expect(() => getSanitizedCopy(baseTree)).to.throw("Valid app tree keys should be present");
        });

        it("should throw if electedSummarizer is missing", async () => {
            delete (baseTree as any).tree[".electedSummarizer"];
            expect(() => getSanitizedCopy(baseTree)).to.throw("Valid app tree keys should be present");
        });
    });
});
