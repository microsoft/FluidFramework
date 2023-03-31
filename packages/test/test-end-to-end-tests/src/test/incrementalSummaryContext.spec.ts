/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntimeOptions } from "@fluidframework/container-runtime";
import { IRequest } from "@fluidframework/core-interfaces";
import {
	IContainerRuntimeBase,
	IIncrementalSummaryContext,
	ISummaryTreeWithStats,
	ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { requestFluidObject, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import {
	ITestFluidObject,
	ITestObjectProvider,
	TestFluidObjectFactory,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";
import { describeNoCompat, getContainerRuntimeApi } from "@fluid-internal/test-version-utils";
import { IFluidSerializer, SharedObject } from "@fluidframework/shared-object-base";
import {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	ISequencedDocumentMessage,
	MessageType,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { pkgVersion } from "../packageVersion";

// mark as experimental
class TestSharedObjectFactory implements IChannelFactory {
	public static readonly Type = "https://graph.microsoft.com/types/test-shared-object";

	public static readonly Attributes: IChannelAttributes = {
		type: TestSharedObjectFactory.Type,
		snapshotFormatVersion: "0.1",
		packageVersion: pkgVersion,
	};

	public get type(): string {
		return TestSharedObjectFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return TestSharedObjectFactory.Attributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<TestSharedObject> {
		const sharedObject = new TestSharedObject(id, runtime, attributes, "TestSharedObject");
		await sharedObject.load(services);
		return sharedObject;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create(document: IFluidDataStoreRuntime, id: string): TestSharedObject {
		return new TestSharedObject(id, document, this.attributes, "TestSharedObject");
	}
}

const snapshotFileName = "header";
interface ISnapshot {
	blobs: string[];
}

interface IBlob {
	value: string;
	seqNumber: number;
}

interface IOp {
	type: "blobStorage";
	value: string;
}
class TestSharedObject extends SharedObject {
	static getFactory(): IChannelFactory {
		return new TestSharedObjectFactory();
	}
	private readonly blobMap: Map<string, IBlob> = new Map();

	protected summarizeCore(
		serializer: IFluidSerializer,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IIncrementalSummaryContext | undefined,
	): ISummaryTreeWithStats {
		const builder = new SummaryTreeBuilder();

		for (const [blobName, blobContent] of this.blobMap.entries()) {
			if (
				incrementalSummaryContext &&
				blobContent.seqNumber <= incrementalSummaryContext.lastAckedSummarySequenceNumber
			) {
				builder.addHandle(
					blobName,
					SummaryType.Blob,
					`${incrementalSummaryContext.summaryPath}/${blobName}`,
				);
			} else {
				builder.addBlob(blobName, JSON.stringify(blobContent));
			}
		}

		const content: ISnapshot = {
			blobs: Array.from(this.blobMap.keys()),
		};

		builder.addBlob(snapshotFileName, JSON.stringify(content));
		return builder.getSummaryTree();
	}
	protected async loadCore(storage: IChannelStorageService): Promise<void> {
		const content = await readAndParse<ISnapshot>(storage, snapshotFileName);
		for (const blob of content.blobs) {
			const blobContent = await readAndParse<IBlob>(storage, blob);
			this.blobMap.set(blob, blobContent);
		}
	}
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		if (message.type === MessageType.Operation) {
			const op = message.contents as IOp;
			switch (op.type) {
				case "blobStorage": {
					const blob: IBlob = {
						value: op.value,
						seqNumber: message.sequenceNumber,
					};
					const blobName = `${this.blobMap.size}`;
					this.blobMap.set(blobName, blob);
					break;
				}
				default:
					throw new Error("Unknown operation");
			}
		}
	}

	public createOp(content: string) {
		const op: IOp = {
			type: "blobStorage",
			value: content,
		};
		this.submitLocalMessage(op);
	}

	protected onDisconnect() {}
	protected applyStashedOp(content: any): unknown {
		throw new Error("Method not implemented.");
	}
}

/**
 * Validates w
 */
describeNoCompat(
	"Incremental summary context fields are properly populated",
	(getTestObjectProvider) => {
		let provider: ITestObjectProvider;
		const dataObjectFactory = new TestFluidObjectFactory([
			["abc", TestSharedObject.getFactory()],
		]);
		const runtimeOptions: IContainerRuntimeOptions = {
			summaryOptions: { summaryConfigOverrides: { state: "disabled" } },
		};
		const innerRequestHandler = async (request: IRequest, runtime: IContainerRuntimeBase) =>
			runtime.IFluidHandleContext.resolveHandle(request);
		const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
			dataObjectFactory,
			[[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
			undefined,
			[innerRequestHandler],
			runtimeOptions,
		);

		const createContainer = async (): Promise<IContainer> => {
			return provider.createContainer(runtimeFactory);
		};

		async function createSummarizer(container: IContainer, summaryVersion?: string) {
			const createSummarizerResult = await createSummarizerFromFactory(
				provider,
				container,
				dataObjectFactory,
				summaryVersion,
				getContainerRuntimeApi(pkgVersion, pkgVersion)
					.ContainerRuntimeFactoryWithDefaultDataStore,
			);
			return createSummarizerResult.summarizer;
		}

		beforeEach(async () => {
			provider = getTestObjectProvider({ syncSummarizer: true });
		});

		it("works", async () => {
			const container = await createContainer();
			const datastore = await requestFluidObject<ITestFluidObject>(container, "default");
			const dds = await datastore.getSharedObject<TestSharedObject>("abc");
			dds.createOp("test data 1");
			dds.createOp("test data 2");
			dds.createOp("test data 3");

			const summarizer = await createSummarizer(container);
			await provider.ensureSynchronized();
			await summarizeNow(summarizer);

			dds.createOp("test data 4");
			await provider.ensureSynchronized();
			const { summaryTree } = await summarizeNow(summarizer);
			assert(summaryTree.tree[".channels"].type === SummaryType.Tree, "expecting a tree!");
			const dataObjectTree = summaryTree.tree[".channels"].tree[datastore.runtime.id];
			assert(dataObjectTree.type === SummaryType.Tree, "tree!");
			const dataObjectChannelsTree = dataObjectTree.tree[".channels"];
			assert(dataObjectChannelsTree.type === SummaryType.Tree, "data store channels tree!");
			const ddsTree = dataObjectChannelsTree.tree[dds.id];
			assert(ddsTree.type === SummaryType.Tree, "dds tree!");
			assert(ddsTree.tree["0"].type === SummaryType.Handle);
			assert(ddsTree.tree["1"].type === SummaryType.Handle);
			assert(ddsTree.tree["2"].type === SummaryType.Handle);
			assert(ddsTree.tree["3"].type === SummaryType.Blob);
		});
	},
);
