/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainerContext, ICriticalContainerError } from "@fluidframework/container-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { MockDeltaManager, MockQuorumClients } from "@fluidframework/test-runtime-utils";
import { IsoBuffer } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import {
	ICreateBlobResponse,
	ISnapshotTree,
	ISummaryHandle,
	ISummaryTree,
	IVersion,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	ContainerRuntime,
	SummaryCompressionAlgorithm,
	ISummaryRuntimeOptions,
} from "../containerRuntime";
import { CompressionSummaryStorageAdapter } from "../summaryStorageCompressionAdapter";

function genOptions(alg: SummaryCompressionAlgorithm | undefined) {
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
	describe("Compression Symetrical Adapter Test", () => {
		it("LZ4 enc / dec", async () => {
			runEncDecAtAdapter(SummaryCompressionAlgorithm.LZ4);
		});
		it("None enc / dec", async () => {
			runEncDecAtAdapter(SummaryCompressionAlgorithm.None);
		});
	});
	describe("Compression Summary Tree Upload Adapter Test", () => {
		it("LZ4 enc / dec", async () => {
			runTreeUploadAndDecAtAdapter(SummaryCompressionAlgorithm.LZ4);
		});
		it("None enc / dec", async () => {
			runTreeUploadAndDecAtAdapter(SummaryCompressionAlgorithm.None);
		});
	});
	describe("Compression Config Test", () => {
		describe("Setting", () => {
			let containerRuntime: ContainerRuntime;
			const myStorage = getMockupStorage(genBlobContent(), {});
			const buildMockContext = (): Partial<IContainerContext> => {
				return {
					deltaManager: new MockDeltaManager(),
					quorum: new MockQuorumClients(),
					storage: myStorage,
					taggedLogger: new MockLogger(),
					clientDetails: { capabilities: { interactive: true } },
					closeFn: (_error?: ICriticalContainerError): void => {},
					updateDirtyContainerState: (_dirty: boolean) => {},
				};
			};
			const mockContext = buildMockContext();
			it("LZ4 config", async () => {
				const summaryOpt: ISummaryRuntimeOptions = genOptions(
					SummaryCompressionAlgorithm.LZ4,
				);
				containerRuntime = await ContainerRuntime.load(
					mockContext as IContainerContext,
					[],
					undefined, // requestHandler
					{ summaryOptions: summaryOpt }, // runtimeOptions
				);

				const wrapper = containerRuntime.storage as any;
				assert.strictEqual(wrapper.algorithm, SummaryCompressionAlgorithm.LZ4);
			});
			it("None config", async () => {
				const summaryOpt: ISummaryRuntimeOptions = genOptions(
					SummaryCompressionAlgorithm.None,
				);
				containerRuntime = await ContainerRuntime.load(
					mockContext as IContainerContext,
					[],
					undefined, // requestHandler
					{ summaryOptions: summaryOpt }, // runtimeOptions
				);
				const wrapper = containerRuntime.storage as any;
				assert.strictEqual(wrapper.algorithm, SummaryCompressionAlgorithm.None);
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
function runEncDecAtAdapter(algorithm: SummaryCompressionAlgorithm) {
	const inputBlobContent = genBlobContent();
	const storage = getMockupStorage(inputBlobContent, {});
	const adapter: IDocumentStorageService = new CompressionSummaryStorageAdapter(
		storage,
		algorithm,
	);
	void adapter.createBlob(inputBlobContent).then((resp) => {
		// eslint-disable-next-line @typescript-eslint/dot-notation
		const compressed = resp["content"];
		const memento = {};
		const readStorage = getMockupStorage(compressed, memento);
		const readAdapter: IDocumentStorageService = new CompressionSummaryStorageAdapter(
			readStorage,
			algorithm,
		);
		void readAdapter.readBlob(resp.id).then((outputBlobContent) => {
			assert.deepEqual(inputBlobContent, IsoBuffer.from(outputBlobContent));
		});
	});
}
function runTreeUploadAndDecAtAdapter(algorithm: SummaryCompressionAlgorithm) {
	const inputBlobContent = genBlobContent();
	const inputSummary: ISummaryTree = buildSummary(inputBlobContent);
	const memento: any = {};
	const storage = getMockupStorage(inputBlobContent, memento);
	const adapter: IDocumentStorageService = new CompressionSummaryStorageAdapter(
		storage,
		algorithm,
	);
	void adapter
		.uploadSummaryWithContext(inputSummary, {
			referenceSequenceNumber: 1,
			proposalHandle: undefined,
			ackHandle: undefined,
		})
		.then((resp) => {
			const compressed = memento.summaryTree.tree.myBlob.content;
			const readStorage = getMockupStorage(compressed, memento);
			const readAdapter: IDocumentStorageService = new CompressionSummaryStorageAdapter(
				readStorage,
				algorithm,
			);
			void readAdapter.readBlob("abcd").then((outputBlobContent) => {
				assert.deepEqual(inputBlobContent, IsoBuffer.from(outputBlobContent));
			});
		});
}

function buildSummary(inputBlobContent): ISummaryTree {
	return {
		type: SummaryType.Tree,
		tree: { myBlob: { type: SummaryType.Blob, content: inputBlobContent } },
	};
}

function getMockupStorage(blobFromRead: ArrayBufferLike, memento: any): IDocumentStorageService {
	const storage: IDocumentStorageService = {
		repositoryUrl: "http://localhost",
		getSnapshotTree: async (
			version?: IVersion,
			scenarioName?: string,
		): Promise<ISnapshotTree | null> => {
			return null;
		},
		getVersions: async (
			versionId: string | null,
			count: number,
			scenarioName?: string,
		): Promise<IVersion[]> => {
			return [];
		},
		createBlob: async (file: ArrayBufferLike): Promise<ICreateBlobResponse> => {
			const obj: ICreateBlobResponse = { id: "abcd" };
			// eslint-disable-next-line @typescript-eslint/dot-notation
			obj["content"] = file;
			return obj;
		},
		readBlob: async (id: string): Promise<ArrayBufferLike> => {
			return blobFromRead;
		},
		uploadSummaryWithContext: async (
			summary: ISummaryTree,
			context: ISummaryContext,
		): Promise<string> => {
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
