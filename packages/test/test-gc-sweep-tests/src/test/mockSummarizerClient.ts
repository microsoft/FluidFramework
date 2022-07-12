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
    ISummaryCancellationToken,
    SummarizerStopReason,
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

export namespace FailingSubmitSummaryStage {
    export type Base = 1;
    export type Generate = 2;
    export type Upload = 3;

    export const Base: Base = 1 as const;
    export const Generate: Generate = 2 as const;
    export const Upload: Upload = 3 as const;
}
export type FailingSubmitSummaryStage =
    FailingSubmitSummaryStage.Base |
    FailingSubmitSummaryStage.Generate |
    FailingSubmitSummaryStage.Upload;

export class ControlledCancellationToken implements ISummaryCancellationToken {
    count: number = 0;
    get cancelled(): boolean {
        this.count++;
        return this.count >= this.whenToCancel;
    }

    constructor(
        private readonly whenToCancel: FailingSubmitSummaryStage,
        public readonly waitCancelled: Promise<SummarizerStopReason> = new Promise(() => {}),
    ) {}
}

export async function submitFailingSummary(
    provider: ITestObjectProvider,
    summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
    logger: ITelemetryLogger,
    failingStage: FailingSubmitSummaryStage,
    fullTree: boolean = false,
) {
    await provider.ensureSynchronized();
    // Submit a summary with a fail token on generate
    const result = await summarizerClient.containerRuntime.submitSummary({
        fullTree,
        refreshLatestAck: false,
        summaryLogger: logger,
        cancellationToken: new ControlledCancellationToken(failingStage),
    });

    const stageMap = new Map<FailingSubmitSummaryStage, string>();
    stageMap.set(FailingSubmitSummaryStage.Base, "base");
    stageMap.set(FailingSubmitSummaryStage.Generate, "generate");
    stageMap.set(FailingSubmitSummaryStage.Upload, "upload");

    const failingStageString = stageMap.get(failingStage);
    assert(result.stage === failingStageString, `Expected a failure on ${failingStageString}`);
    assert(result.stage !== "submit", `Expected a failing stage: ${failingStageString}`);
    assert(result.error !== undefined, `Expected an error on ${failingStageString}`);
}

/**
 * Generates, uploads, submits a summary on the given container runtime and waits for the summary to be ack'd
 * by the server.
 * @returns The acked summary and the last sequence number contained in the summary that is submitted.
 */
export async function submitAndAckSummary(
    provider: ITestObjectProvider,
    summarizerClient: { containerRuntime: ContainerRuntime; summaryCollection: SummaryCollection; },
    logger: ITelemetryLogger,
    fullTree: boolean = false,
    cancellationToken: ISummaryCancellationToken = neverCancelledSummaryToken,
) {
    // Wait for all pending ops to be processed by all clients.
    await provider.ensureSynchronized();
    const summarySequenceNumber = summarizerClient.containerRuntime.deltaManager.lastSequenceNumber;
    // Submit a summary
    const result = await summarizerClient.containerRuntime.submitSummary({
        fullTree,
        refreshLatestAck: false,
        summaryLogger: logger,
        cancellationToken,
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

export function getGCStateFromSummary(
    summary: ISummaryTree,
    blobHandleExpected?: boolean,
): IGarbageCollectionState | undefined {
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
        if (
            blobHandleExpected === true &&
            gcBlob?.type === SummaryType.Handle
        ) {
            assert(gcBlob?.handleType === SummaryType.Blob, `Expected the handle to be a blob handle`);
            return undefined;
        }

        assert(gcBlob?.type === SummaryType.Blob, `GC blob not available`);
        const gcState = JSON.parse(gcBlob.content as string) as IGarbageCollectionState;
        // Merge the GC state of this blob into the root GC state.
        rootGCState = concatGarbageCollectionStates(rootGCState, gcState);
    }
    return rootGCState;
}
