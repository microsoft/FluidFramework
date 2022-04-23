/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IHostLoader, ILoaderOptions } from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import {
    LocalResolver,
    LocalDocumentServiceFactory,
} from "@fluidframework/local-driver";
import { SharedString } from "@fluidframework/sequence";
import { IUrlResolver } from "@fluidframework/driver-definitions";
import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import {
    createLoader,
    LoaderContainerTracker,
    TestFluidObjectFactory,
} from "@fluidframework/test-utils";

const stringId = "stringKey";
const codeDetails: IFluidCodeDetails = {
    package: "localServerTestPackage",
    config: {},
};

// Quorum val transormations
const quorumKey = "code";
const baseQuorum = [
    [
        quorumKey,
        {
            key: quorumKey,
            value: codeDetails,
            approvalSequenceNumber: 0,
            commitSequenceNumber: 0,
            sequenceNumber: 0,
        },
    ],
];

const baseAttributes = {
    minimumSequenceNumber: 0,
    sequenceNumber: 0,
    term: 1,
};

const baseSummarizer = {
    electionSequenceNumber: 0,
};

function buildSummaryTree(attr, quorumVal, summarizer): any {
    return {
        type: 1,
        tree: {
            ".metadata": {
                type: 2,
                content: "{}",
            },
            ".electedSummarizer": {
                type: 2,
                content: JSON.stringify(summarizer),
            },
            ".protocol": {
                type: 1,
                tree: {
                    quorumMembers: {
                        type: 2,
                        content: "[]",
                    },
                    quorumProposals: {
                        type: 2,
                        content: "[]",
                    },
                    quorumValues: {
                        type: 2,
                        content: JSON.stringify(quorumVal),
                    },
                    attributes: {
                        type: 2,
                        content: JSON.stringify(attr),
                    },
                },
            },
            ".app": {
                type: 1,
                tree: {
                    [".channels"]: {
                        type: 1,
                        tree: {},
                    },
                },
            },
        },
    };
}

/**
 * Creates a loader with the given package entries and a delta connection server.
 * @param packageEntries - A list of code details to Fluid entry points.
 * @param deltaConnectionServer - The delta connection server to use as the server.
 */
function createLocalLoader(
    packageEntries: Iterable<[IFluidCodeDetails, TestFluidObjectFactory]>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
    options?: ILoaderOptions,
): IHostLoader {
    const documentServiceFactory = new LocalDocumentServiceFactory(
        deltaConnectionServer,
        undefined,
        undefined,
    );

    return createLoader(
        packageEntries,
        documentServiceFactory,
        urlResolver,
        undefined,
        options,
    );
}

describe("Container Hydration", () => {
    const factory = new TestFluidObjectFactory([[stringId, SharedString.getFactory()]]);

    let deltaConnectionServer: ILocalDeltaConnectionServer;
    let urlResolver: LocalResolver;
    let loaderContainerTracker: LoaderContainerTracker;

    function buildTestLoader(): IHostLoader {
        const loader = createLocalLoader(
            [[codeDetails, factory]],
            deltaConnectionServer,
            urlResolver,
            undefined,
        );
        loaderContainerTracker.add(loader);
        return loader;
    }

    beforeEach(async () => {
        deltaConnectionServer = LocalDeltaConnectionServer.create();
        urlResolver = new LocalResolver();
        loaderContainerTracker = new LoaderContainerTracker();
    });

    afterEach(() => {
        loaderContainerTracker.reset();
    });

    it("can load snapshot if starts with seq #0", async () => {
        const loader = buildTestLoader();
        const summaryTree = buildSummaryTree(baseAttributes, baseQuorum, baseSummarizer);
        const summaryString = JSON.stringify(summaryTree);

        await assert.doesNotReject(loader.rehydrateDetachedContainerFromSnapshot(summaryString));
    });

    it("does load snapshot if starts with seq that is not #0", async () => {
        const loader = buildTestLoader();
        const attr = {
            ...baseAttributes,
            sequenceNumber: 5,
        };
        const summaryTree = buildSummaryTree(attr, baseQuorum, baseSummarizer);
        const summaryString = JSON.stringify(summaryTree);

        await assert.doesNotReject(loader.rehydrateDetachedContainerFromSnapshot(summaryString));
    });

    afterEach(async () => {
        await deltaConnectionServer.webSocketServer.close();
    });
});
