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
import { IsoBuffer } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import { ICreateBlobResponse, ISnapshotTree, ISummaryBlob, ISummaryHandle, ISummaryTree, IVersion, SummaryType }
    from "@fluidframework/protocol-definitions";
import {
    ContainerRuntime, SummaryCompressionAlgorithms, ISummaryRuntimeOptions,
} from "../containerRuntime";
import { CompressionSummaryStorageHooks } from "../summaryStorageCompressionHooks";
import { buildSummaryStorageAdapter } from "../summaryStorageAdapter";

function genOptions(alg: SummaryCompressionAlgorithms | undefined) {
    const summaryOptions: ISummaryRuntimeOptions = {
        summaryConfigOverrides: {
            compressionAlgorithm: alg,
            state: "enabled",
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

function genBlobContent() {
    const array: Uint8Array = new Uint8Array(600);
    for (let i = 0; i < 600; i++) {
        const b = i % 10;
        array[i] = b;
    }
    return IsoBuffer.from(array);
}

describe("Compression", () => {
    describe("Compression Symetrical Hook Test", () => {
        it("LZ4 enc / dec", async () => {
            const hook: CompressionSummaryStorageHooks =
                new CompressionSummaryStorageHooks(SummaryCompressionAlgorithms.LZ4, 500, false);
            runEncDecAtHooks(hook);
        });
        it("None enc / dec", async () => {
            const hook: CompressionSummaryStorageHooks =
                new CompressionSummaryStorageHooks(SummaryCompressionAlgorithms.None, 500, false);
            runEncDecAtHooks(hook);
        });
    });
    describe("Compression Summary Tree Upload Hook Test", () => {
        it("LZ4 upload / dec", async () => {
            const hook: CompressionSummaryStorageHooks =
                new CompressionSummaryStorageHooks(SummaryCompressionAlgorithms.LZ4, 500, false);
            runTreeUploadAndDecAtHooks(hook);
        });
        it("None upload / dec", async () => {
            const hook: CompressionSummaryStorageHooks =
                new CompressionSummaryStorageHooks(SummaryCompressionAlgorithms.None, 500, false);
            runTreeUploadAndDecAtHooks(hook);
        });
    });
    describe("Compression Symetrical Adapter Test", () => {
        it("LZ4 enc / dec", async () => {
            const hook: CompressionSummaryStorageHooks =
                new CompressionSummaryStorageHooks(SummaryCompressionAlgorithms.LZ4, 500, false);
            runEncDecAtAdapter(hook);
        });
        it("None enc / dec", async () => {
            const hook: CompressionSummaryStorageHooks =
                new CompressionSummaryStorageHooks(SummaryCompressionAlgorithms.None, 500, false);
            runEncDecAtAdapter(hook);
        });
    });
    describe("Compression Config Test", () => {
        describe("Setting", () => {
            let containerRuntime: ContainerRuntime;
            const myStorage = getMockupStorage(genBlobContent(), {});
            const buildMockContext = ((): Partial<IContainerContext> => {
                return {
                    deltaManager: new MockDeltaManager(),
                    quorum: new MockQuorumClients(),
                    storage: myStorage,
                    taggedLogger: new MockLogger(),
                    clientDetails: { capabilities: { interactive: true } },
                    closeFn: (_error?: ICriticalContainerError): void => { },
                    updateDirtyContainerState: (_dirty: boolean) => { },
                };
            });
            const mockContext = buildMockContext();
            it("LZ4 config", async () => {
                const summaryOpt: ISummaryRuntimeOptions = genOptions(SummaryCompressionAlgorithms.LZ4);
                containerRuntime = await ContainerRuntime.load(
                    mockContext as IContainerContext,
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
                    mockContext as IContainerContext,
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
                    mockContext as IContainerContext,
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
                    mockContext as IContainerContext,
                    [],
                    undefined, // requestHandler
                    { summaryOptions: summaryOpt }, // runtimeOptions
                );

                const wrapper = containerRuntime.storage as any;
                assert.deepStrictEqual(wrapper, myStorage);
            });
        });
    });
});
function runEncDecAtAdapter(hook: CompressionSummaryStorageHooks) {
    const inputBlobContent = genBlobContent();
    const storage = getMockupStorage(inputBlobContent, {});
    const adapter: IDocumentStorageService = buildSummaryStorageAdapter(storage, [hook]);
    void adapter.createBlob(inputBlobContent).then((resp) => {
        // eslint-disable-next-line @typescript-eslint/dot-notation
        const compressed = resp["content"];
        const memento = {};
        const readStorage = getMockupStorage(compressed, memento);
        const readAdapter: IDocumentStorageService = buildSummaryStorageAdapter(readStorage, [hook]);
        void readAdapter.readBlob(resp.id).then((outputBlobContent) => {
            assert.deepEqual(inputBlobContent, IsoBuffer.from(outputBlobContent));
        });
    });
}

function runTreeUploadAndDecAtHooks(hook: CompressionSummaryStorageHooks) {
    const inputBlobContent = genBlobContent();
    const inputSummary: ISummaryTree = buildSummary(inputBlobContent);
    const { prepSummary } = hook.onPreUploadSummaryWithContext(inputSummary,
        { referenceSequenceNumber: 1, proposalHandle: undefined, ackHandle: undefined });
    const compressed = (prepSummary.tree.myBlob as ISummaryBlob).content;
    const outputBlobContent = IsoBuffer.from(hook.onPostReadBlob(IsoBuffer.from(compressed)));
    assert.deepEqual(inputBlobContent, outputBlobContent);
}

function buildSummary(inputBlobContent): ISummaryTree {
    return {
        type: SummaryType.Tree,
        tree: { myBlob: { type: SummaryType.Blob, content: inputBlobContent } },
    };
}

function runEncDecAtHooks(hook: CompressionSummaryStorageHooks) {
    const inputBlobContent = genBlobContent();
    const compressed = hook.onPreCreateBlob(inputBlobContent);
    const outputBlobContent = IsoBuffer.from(hook.onPostReadBlob(compressed));
    assert.deepEqual(inputBlobContent, outputBlobContent);
}

function getMockupStorage(blobFromRead: ArrayBufferLike, memento: any): IDocumentStorageService {
    const storage: IDocumentStorageService = {
        repositoryUrl: "http://localhost",
        getSnapshotTree: async (version?: IVersion, scenarioName?: string):
            Promise<ISnapshotTree | null> => { return null; },
        getVersions: async (
            versionId: string | null,
            count: number,
            scenarioName?: string,
        ): Promise<IVersion[]> => { return []; },
        createBlob: async (file: ArrayBufferLike): Promise<ICreateBlobResponse> => {
            const obj: ICreateBlobResponse = { id: "abcd" };
            // eslint-disable-next-line @typescript-eslint/dot-notation
            obj["content"] = file;
            return obj;
        },
        readBlob: async (id: string): Promise<ArrayBufferLike> => {
            return blobFromRead;
        },
        uploadSummaryWithContext: async (summary: ISummaryTree, context: ISummaryContext): Promise<string> => {
            memento.summaryTree = summary;
            return "abcd";
        },
        downloadSummary: async (handle: ISummaryHandle): Promise<ISummaryTree> => {
            const ret: any = {};
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return ret;
        },

    };
    return storage;
}
