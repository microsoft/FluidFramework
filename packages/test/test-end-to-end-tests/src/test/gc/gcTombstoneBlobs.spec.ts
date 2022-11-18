/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    ISummarizer, RuntimeHeaders,
} from "@fluidframework/container-runtime";
import {
    create404Response,
    exceptionToResponse,
    requestFluidObject, responseToException } from "@fluidframework/runtime-utils";
import {
    ITestObjectProvider,
    createSummarizerWithContainer,
    summarizeNow,
    waitForContainerConnection,
    mockConfigProvider,
    ITestContainerConfig,
} from "@fluidframework/test-utils";
import { describeNoCompat, ITestDataObject, itExpects } from "@fluidframework/test-version-utils";
import { delay, stringToBuffer } from "@fluidframework/common-utils";
import { IFluidHandle, FluidObject, IFluidHandleContext, IRequest, IResponse, IFluidRouter } from "@fluidframework/core-interfaces";
import { IContainer } from "@fluidframework/container-definitions";

class RemoteFluidObjectHandle implements IFluidHandle {
    public get IFluidRouter() { return this; }
    public get IFluidHandleContext() { return this; }
    public get IFluidHandle() { return this; }

    public readonly isAttached = true;
    private objectP: Promise<FluidObject> | undefined;

    /**
     * Creates a new RemoteFluidObjectHandle when parsing an IFluidHandle.
     * @param absolutePath - The absolute path to the handle from the container runtime.
     * @param routeContext - The root IFluidHandleContext that has a route to this handle.
     */
    constructor(
        public readonly absolutePath: string,
        public readonly routeContext: IFluidHandleContext,
    ) {
        assert(absolutePath.startsWith("/"), "Handles should always have absolute paths");
    }

    public async get(): Promise<any> {
        if (this.objectP === undefined) {
            // Add `viaHandle` header to distinguish from requests from non-handle paths.
            const request: IRequest = { url: this.absolutePath, headers: { [RuntimeHeaders.viaHandle]: true } };
            this.objectP = this.routeContext.resolveHandle(request)
                .then<FluidObject>((response) => {
                    if (response.mimeType === "fluid/object") {
                        const fluidObject: FluidObject = response.value;
                        return fluidObject;
                    }
                    throw responseToException(response, request);
                });
        }
        return this.objectP;
    }

    public attachGraph(): void {
        return;
    }

    public bind(handle: IFluidHandle): void {
        handle.attachGraph();
    }

    public async request(request: IRequest): Promise<IResponse> {
        try {
            const object: FluidObject<IFluidRouter> = await this.get();
            const router = object.IFluidRouter;

            return router !== undefined
                ? router.request(request)
                : create404Response(request);
        } catch (error) {
            return exceptionToResponse(error);
        }
    }
}


describeNoCompat("GC Blob Tombstoned When It Is Sweep Ready", (getTestObjectProvider) => {
    const waitLessThanSweepTimeoutMs = 100;
    const sweepTimeoutMs = 200;
    assert(waitLessThanSweepTimeoutMs < sweepTimeoutMs, "waitLessThanSweepTimeoutMs should be < sweepTimeoutMs");
    const settings = {
        "Fluid.GarbageCollection.Test.Tombstone": "true",
        "Fluid.GarbageCollection.TestOverride.SweepTimeoutMs": sweepTimeoutMs,
    };

    const testContainerConfig: ITestContainerConfig = {
        runtimeOptions: {
            summaryOptions: {
                summaryConfigOverrides: {
                    state: "disableHeuristics",
                    maxAckWaitTime: 10000,
                    maxOpsSinceLastSummary: 7000,
                    initialSummarizerDelayMs: 0,
                    summarizerClientElection: false,
                },
            },
            gcOptions: {
                gcAllowed: true,
                inactiveTimeoutMs: 0,
            },
        },
        loaderProps: {
            configProvider: mockConfigProvider(settings),
        },
    };

    let provider: ITestObjectProvider;
    let documentAbsoluteUrl: string | undefined;

    const makeContainer = async () => {
        const container = await provider.makeTestContainer(testContainerConfig);
        documentAbsoluteUrl = await container.getAbsoluteUrl("");
        return container;
    };

    const loadSummarizerAndContainer = async (summaryVersion?: string) => {
        return createSummarizerWithContainer(
            provider,
            documentAbsoluteUrl,
            testContainerConfig,
            summaryVersion);
    };
    const summarize = async (summarizer: ISummarizer) => {
        await provider.ensureSynchronized();
        return summarizeNow(summarizer);
    };

    beforeEach(async function() {
        provider = getTestObjectProvider({ syncSummarizer: true });
        if (provider.driver.type !== "local") {
            this.skip();
        }
    });

    // This function creates an unreferenced blob and returns the blob's id and the summary version that
    // blob was unreferenced in.
    const summarizationWithUnreferencedBlobAfterTime =
    async (approximateUnreferenceTimestampMs: number) => {
        const container = await makeContainer();
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        await waitForContainerConnection(container);

        // Create blob
        const handleKey = "handle";
        const blobContents = "Blob contents";
        const blobHandle = await defaultDataObject._runtime.uploadBlob(stringToBuffer(blobContents, "utf-8"));

        // Reference a blob - important for making it live
        defaultDataObject._root.set(handleKey, blobHandle);

        // Unreference a blob
        defaultDataObject._root.delete(handleKey);

        // Summarize
        const {
            container: summarizingContainer1,
            summarizer: summarizer1,
        } = await loadSummarizerAndContainer();
        const summaryVersion = (await summarize(summarizer1)).summaryVersion;

        // Close the containers as these containers would be closed by session expiry before sweep ready ever occurs
        container.close();
        summarizingContainer1.close();

        // Wait some time, the datastore can be in many different unreference states
        await delay(approximateUnreferenceTimestampMs);

        // Load a new container and summarizer based on the latest summary, summarize
        const {
            container: summarizingContainer2,
            summarizer: summarizer2,
        } = await loadSummarizerAndContainer(summaryVersion);

        return {
            absolutePath: blobHandle.absolutePath,
            summarizingContainer: summarizingContainer2,
            summarizer: summarizer2,
            summaryVersion,
        };
    };

    const sendOpToUpdateSummaryTimestampToNow = async (container: IContainer) => {
        const defaultDataObject = await requestFluidObject<ITestDataObject>(container, "default");
        defaultDataObject._root.set("send a", "op");
    };

    // If this test starts failing due to runtime is closed errors try first adjusting `sweepTimeoutMs` above
    itExpects("Handle request for tombstoned blobs fails in summarizing container loaded before sweep timeout",
    [
        {
            error: "TombstonedBlobRequested",
            eventName: "fluid:telemetry:ContainerRuntime:TombstonedBlobRequested",
            viaHandle: true,
        },
    ],
    async () => {
        const {
            absolutePath,
            summarizingContainer,
            summarizer,
        } = await summarizationWithUnreferencedBlobAfterTime(sweepTimeoutMs);

        const defaultDataObject = await requestFluidObject<ITestDataObject>(summarizingContainer, "default");
        const blobHandle = new RemoteFluidObjectHandle(
            absolutePath,
            defaultDataObject._context.containerRuntime.IFluidHandleContext,
        );

        await sendOpToUpdateSummaryTimestampToNow(summarizingContainer);

        // The blob should be tombstoned now
        await summarize(summarizer);

        // Handle requests for blob handle should fail!
        const response = await blobHandle.get();
        assert(response !== undefined);
    });
});
