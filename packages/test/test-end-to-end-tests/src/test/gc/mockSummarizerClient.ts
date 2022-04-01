/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject } from "@fluidframework/aqueduct";
import { assert, TelemetryNullLogger } from "@fluidframework/common-utils";
import { IRuntimeFactory, LoaderHeader } from "@fluidframework/container-definitions";
import {
    ContainerRuntime,
    gcBlobPrefix,
    gcTreeKey,
    ISummaryNackMessage,
    SummaryCollection,
    neverCancelledSummaryToken,
} from "@fluidframework/container-runtime";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { concatGarbageCollectionStates } from "@fluidframework/garbage-collector";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestObjectProvider } from "@fluidframework/test-utils";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { IGarbageCollectionState } from "@fluidframework/runtime-definitions";
import { ILoaderProps } from "@fluidframework/container-loader";

// data store that exposes container runtime for testing.
export class TestDataObject extends DataObject {
    public get _root() {
        return this.root;
    }

    public get dataStoreRuntime(): IFluidDataStoreRuntime {
        return this.runtime;
    }

    public get containerRuntime(): ContainerRuntime {
        return this.context.containerRuntime as ContainerRuntime;
    }

    public get _context() {
        return this.context;
    }
}

/**
  * Loads a summarizer client with the given version (if any) and returns its container runtime and summary collection.
  */
export async function loadSummarizer(
    provider: ITestObjectProvider,
    runtimeFactory: IRuntimeFactory,
    sequenceNumber: number,
    summaryVersion?: string,
    loaderProps?: Partial<ILoaderProps>,
) {
    const requestHeader = {
        [LoaderHeader.cache]: false,
        [LoaderHeader.clientDetails]: {
            capabilities: { interactive: true },
            type: "summarizer",
        },
        [DriverHeader.summarizingClient]: true,
        [LoaderHeader.reconnect]: false,
        [LoaderHeader.sequenceNumber]: sequenceNumber,
        [LoaderHeader.version]: summaryVersion,
    };
    const summarizer = await provider.loadContainer(runtimeFactory, loaderProps, requestHeader);

    // Fail fast if we receive a nack as something must have gone wrong.
    const summaryCollection = new SummaryCollection(summarizer.deltaManager, new TelemetryNullLogger());
    summaryCollection.on("summaryNack", (op: ISummaryNackMessage) => {
        throw new Error(`Received Nack for sequence#: ${op.contents.summaryProposal.summarySequenceNumber}`);
    });

    const defaultDataStore = await requestFluidObject<TestDataObject>(summarizer, "default");
    return {
        containerRuntime: defaultDataStore.containerRuntime,
        summaryCollection,
    };
}

/**
 * Generates, uploads, submits a summary on the given container runtime and waits for the summary to be ack'd
 * by the server.
 * @returns The acked summary and the last sequence number contained in the summary that is submitted.
 */
export async function submitAndAckSummary(
    provider: ITestObjectProvider,
    summarizerClient: { containerRuntime: ContainerRuntime, summaryCollection: SummaryCollection },
    logger: ITelemetryLogger,
    fullTree: boolean = false,
) {
    // Wait for all pending ops to be processed by all clients.
    await provider.ensureSynchronized();
    const summarySequenceNumber = summarizerClient.containerRuntime.deltaManager.lastSequenceNumber;
    // Submit a summary
    const result = await summarizerClient.containerRuntime.submitSummary({
        fullTree,
        refreshLatestAck: false,
        summaryLogger: logger,
        cancellationToken: neverCancelledSummaryToken,
    });
    assert(result.stage === "submit", "The summary was not submitted");
    // Wait for the above summary to be ack'd.
    const ackedSummary = await summarizerClient.summaryCollection.waitSummaryAck(summarySequenceNumber);
    // Update the container runtime with the given ack. We have to do this manually because there is no summarizer
    // client in these tests that takes care of this.
    await summarizerClient.containerRuntime.refreshLatestSummaryAck(
        ackedSummary.summaryOp.contents.handle,
        ackedSummary.summaryAck.contents.handle,
        ackedSummary.summaryOp.referenceSequenceNumber,
        logger,
    );
    return { ackedSummary, summarySequenceNumber };
}

export function getGCStateFromSummary(summary: ISummaryTree): IGarbageCollectionState | undefined {
    const rootGCTree = summary.tree[gcTreeKey];
    if (rootGCTree === undefined) {
        return undefined;
    }
    assert(rootGCTree.type === SummaryType.Tree, `GC state should be a tree`);

    let rootGCState: IGarbageCollectionState = { gcNodes: {} };
    for (const key of Object.keys(rootGCTree.tree)) {
        // Skip blobs that do not stsart with the GC prefix.
        if (!key.startsWith(gcBlobPrefix)) {
            continue;
        }

        const gcBlob = rootGCTree.tree[key];
        assert(gcBlob?.type === SummaryType.Blob, `GC blob not available`);
        const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;
        // Merge the GC state of this blob into the root GC state.
        rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
    }
    return rootGCState;
}
