/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { assert } from "@fluidframework/common-utils";
import { IContainer, IHostLoader, LoaderHeader } from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import {
    gcBlobPrefix,
    gcTreeKey,
    IGCRuntimeOptions,
    ISummarizer,
    ISummaryRuntimeOptions,
} from "@fluidframework/container-runtime";
import { FluidObject, IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { concatGarbageCollectionStates } from "@fluidframework/garbage-collector";
import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IContainerRuntimeBase,
    IFluidDataStoreFactory,
    IGarbageCollectionState,
} from "@fluidframework/runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ITestContainerConfig, ITestObjectProvider } from "@fluidframework/test-utils";
import { mockConfigProvider } from "./gcTestConfigs";

const summarizerClientType = "summarizer";

async function createSummarizerCore(container: IContainer, loader: IHostLoader, summaryVersion?: string) {
    const absoluteUrl = await container.getAbsoluteUrl("");
    if (absoluteUrl === undefined) {
        throw new Error("URL could not be resolved");
    }

    const request: IRequest = {
        headers: {
            [LoaderHeader.cache]: false,
            [LoaderHeader.clientDetails]: {
                capabilities: { interactive: false },
                type: summarizerClientType,
            },
            [DriverHeader.summarizingClient]: true,
            [LoaderHeader.reconnect]: false,
            [LoaderHeader.version]: summaryVersion,
        },
        url: absoluteUrl,
    };
    const summarizerContainer = await loader.resolve(request);
    await waitForContainerConnection(summarizerContainer);

    const fluidObject =
        await requestFluidObject<FluidObject<ISummarizer>>(summarizerContainer, { url: "_summarizer" });
    if (fluidObject.ISummarizer === undefined) {
        throw new Error("Fluid object does not implement ISummarizer");
    }
    return fluidObject.ISummarizer;
}

const defaultSummaryOptions: ISummaryRuntimeOptions = {
    summaryConfigOverrides: {
        state: "disableHeuristics",
        maxAckWaitTime: 10000,
        maxOpsSinceLastSummary: 7000,
        initialSummarizerDelayMs: 0,
        summarizerClientElection: false,
    },
};

export async function createSummarizerFromFactory(
    provider: ITestObjectProvider,
    container: IContainer,
    dataStoreFactory: IFluidDataStoreFactory,
    summaryVersion?: string,
    containerRuntimeFactoryType = ContainerRuntimeFactoryWithDefaultDataStore,
): Promise<ISummarizer> {
    const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
        runtime.IFluidHandleContext.resolveHandle(request);
    const runtimeFactory = new containerRuntimeFactoryType(
        dataStoreFactory,
        [
            [dataStoreFactory.type, Promise.resolve(dataStoreFactory)],
        ],
        undefined,
        [innerRequestHandler],
        { summaryOptions: defaultSummaryOptions },
    );

    const loader = provider.createLoader(
        [[provider.defaultCodeDetails, runtimeFactory]],
        { configProvider: mockConfigProvider() },
    );

    return createSummarizerCore(container, loader, summaryVersion);
}

export async function createSummarizer(
    provider: ITestObjectProvider,
    container: IContainer,
    summaryVersion?: string,
    gcOptions?: IGCRuntimeOptions,
): Promise<ISummarizer> {
    const testContainerConfig: ITestContainerConfig = {
        runtimeOptions: {
            summaryOptions: defaultSummaryOptions,
            gcOptions,
        },
        loaderProps: { configProvider: mockConfigProvider() },
    };

    const loader = provider.makeTestLoader(testContainerConfig);
    return createSummarizerCore(container, loader, summaryVersion);
}

export async function summarizeNow(summarizer: ISummarizer, reason: string = "end-to-end test") {
    const result = summarizer.summarizeOnDemand({ reason });

    const submitResult = await result.summarySubmitted;
    assert(submitResult.success, "on-demand summary should submit");
    assert(submitResult.data.stage === "submit",
        "on-demand summary submitted data stage should be submit");
    assert(submitResult.data.summaryTree !== undefined, "summary tree should exist");

    const broadcastResult = await result.summaryOpBroadcasted;
    assert(broadcastResult.success, "summary op should be broadcast");

    const ackNackResult = await result.receivedSummaryAckOrNack;
    assert(ackNackResult.success, "summary op should be acked");

    await new Promise((resolve) => process.nextTick(resolve));

    return {
        summaryTree: submitResult.data.summaryTree,
        summaryVersion: ackNackResult.data.summaryAckOp.contents.handle,
    };
}

export function getGCStateFromSummary(summary: ISummaryTree): IGarbageCollectionState | undefined {
    const rootGCTree = summary.tree[gcTreeKey];
    if (rootGCTree === undefined) {
        return undefined;
    }
    assert(rootGCTree.type === SummaryType.Tree, `GC state should be a tree`);

    let rootGCState: IGarbageCollectionState = { gcNodes: {} };
    for (const key of Object.keys(rootGCTree.tree)) {
        // Skip blobs that do not start with the GC prefix.
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

export async function waitForContainerConnection(container: IContainer): Promise<void> {
    if (container.connectionState !== ConnectionState.Connected) {
        return new Promise((resolve) => container.once("connected", () => resolve()));
    }
}
