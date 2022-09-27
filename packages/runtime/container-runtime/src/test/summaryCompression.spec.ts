/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
    IContainerContext,
    ICriticalContainerError,
} from "@fluidframework/container-definitions";
import {
    MockLogger,
} from "@fluidframework/telemetry-utils";
import { MockDeltaManager, MockQuorumClients } from "@fluidframework/test-runtime-utils";
import { ContainerRuntime, SummaryCompressionAlgorithms, ISummaryRuntimeOptions,
} from "../containerRuntime";
import { CompressionSummaryStorageHooks } from "../summaryStorageCompressionHooks";
// import { CompressionSummaryStorageHooks } from "../summaryStorageCompressionHooks";

function genOptions(alg: SummaryCompressionAlgorithms | undefined) {
    const summaryOptions: ISummaryRuntimeOptions = {
        summaryConfigOverrides: {
            compressionAlgorithm: alg,
            state: "enabled",
            idleTime: 15 * 1000, // 15 secs.
            minIdleTime: 0,
            maxIdleTime: 30 * 1000, // 30 secs.
            maxTime: 60 * 1000, // 1 min.
            maxOps: 100, // Summarize if 100 weighted ops received since last snapshot.
            minOpsForLastSummaryAttempt: 10,
            maxAckWaitTime: 10 * 60 * 1000, // 10 mins.
            maxOpsSinceLastSummary: 7000,
            initialSummarizerDelayMs: 5 * 1000, // 5 secs.
            summarizerClientElection: false,
            nonRuntimeOpWeight: 0.1,
            runtimeOpWeight: 1.0,
        },
    };
    return summaryOptions;
}

describe("Compression", () => {
    describe("Compression Config Test", () => {
        describe("Setting", () => {
            let containerRuntime: ContainerRuntime;
            const getMockContext = ((): Partial<IContainerContext> => {
                return {
                    deltaManager: new MockDeltaManager(),
                    quorum: new MockQuorumClients(),
                    taggedLogger: new MockLogger(),
                    clientDetails: { capabilities: { interactive: true } },
                    closeFn: (_error?: ICriticalContainerError): void => { },
                    updateDirtyContainerState: (_dirty: boolean) => { },
                };
            });

            it("LZ4 config", async () => {
                const summaryOpt: ISummaryRuntimeOptions = genOptions(SummaryCompressionAlgorithms.LZ4);
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    { summaryOptions: summaryOpt }, // runtimeOptions
                );

                const wrapper = containerRuntime.storage as any;
                assert.strictEqual(wrapper.hasHooks, true);
                const multihook = wrapper.hooks;
                const hook: CompressionSummaryStorageHooks = multihook.hooks[0];
                assert.strictEqual(hook.algorithm, SummaryCompressionAlgorithms.LZ4);
            });
            it("Deflate config", async () => {
                const summaryOpt: ISummaryRuntimeOptions = genOptions(SummaryCompressionAlgorithms.Deflate);
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    { summaryOptions: summaryOpt }, // runtimeOptions
                );

                const wrapper = containerRuntime.storage as any;
                assert.strictEqual(wrapper.hasHooks, true);
                const multihook = wrapper.hooks;
                const hook: CompressionSummaryStorageHooks = multihook.hooks[0];
                assert.strictEqual(hook.algorithm, SummaryCompressionAlgorithms.Deflate);
            });
            it("None config", async () => {
                const summaryOpt: ISummaryRuntimeOptions = genOptions(SummaryCompressionAlgorithms.None);
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    { summaryOptions: summaryOpt }, // runtimeOptions
                );

                const wrapper = containerRuntime.storage as any;
                assert.strictEqual(wrapper.hasHooks, true);
                const multihook = wrapper.hooks;
                const hook: CompressionSummaryStorageHooks = multihook.hooks[0];
                assert.strictEqual(hook.algorithm, SummaryCompressionAlgorithms.None);
            });
            it("Empty config", async () => {
                const summaryOpt: ISummaryRuntimeOptions = genOptions(undefined);
                containerRuntime = await ContainerRuntime.load(
                    getMockContext() as IContainerContext,
                    [],
                    undefined, // requestHandler
                    { summaryOptions: summaryOpt }, // runtimeOptions
                );

                const wrapper = containerRuntime.storage as any;
                assert.strictEqual(wrapper, undefined);
            });
        });
    });
});
