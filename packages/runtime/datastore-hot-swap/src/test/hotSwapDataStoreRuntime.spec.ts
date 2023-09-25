/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	IClientDetails,
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISnapshotTree,
	SummaryType,
} from "@fluidframework/protocol-definitions";
import {
	IContainerRuntimeBase,
	IGarbageCollectionData,
	ISummarizerNodeWithGC,
	CreateChildSummarizerNodeFn,
	CreateChildSummarizerNodeParam,
	IFluidDataStoreRegistry,
	IGarbageCollectionDetailsBase,
	IIdCompressor,
	IIdCompressorCore,
	ISummarizeResult,
	ISummarizerNodeConfigWithGC,
	ITelemetryContext,
	SummarizeInternalFn,
} from "@fluidframework/runtime-definitions";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	AttachState,
	ContainerErrorType,
	IAudience,
	IDeltaManager,
	ILoaderOptions,
} from "@fluidframework/container-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { IChannel, IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import {
	IErrorBase,
	FluidObject,
	IFluidHandle,
	IFluidHandleContext,
} from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { HotSwapFluidDataStoreRuntime } from "../hotSwapDataStoreRuntime";
import { IModifiableFluidDataStoreContext } from "../types";

class MockSummarizerNode implements ISummarizerNodeWithGC {
	createChild(
		summarizeInternalFn: SummarizeInternalFn,
		id: string,
		createParam: CreateChildSummarizerNodeParam,
		config?: ISummarizerNodeConfigWithGC | undefined,
		getGCDataFn?:
			| ((fullGC?: boolean | undefined) => Promise<IGarbageCollectionData>)
			| undefined,
		getBaseGCDetailsFn?: (() => Promise<IGarbageCollectionDetailsBase>) | undefined,
	): ISummarizerNodeWithGC {
		throw new Error("Method not implemented.");
	}
	deleteChild(id: string): void {
		throw new Error("Method not implemented.");
	}
	getChild(id: string): ISummarizerNodeWithGC | undefined {
		throw new Error("Method not implemented.");
	}
	async getGCData(fullGC?: boolean | undefined): Promise<IGarbageCollectionData> {
		throw new Error("Method not implemented.");
	}
	isReferenced(): boolean {
		throw new Error("Method not implemented.");
	}
	updateUsedRoutes(usedRoutes: string[]): void {
		throw new Error("Method not implemented.");
	}
	referenceSequenceNumber: number = 1;
	invalidate(sequenceNumber: number): void {
		throw new Error("Method not implemented.");
	}
	async summarize(
		fullTree: boolean,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): Promise<ISummarizeResult> {
		throw new Error("Method not implemented.");
	}
	updateBaseSummaryState(snapshot: ISnapshotTree): void {
		throw new Error("Method not implemented.");
	}
	recordChange(op: ISequencedDocumentMessage): void {
		throw new Error("Method not implemented.");
	}
	isSummaryInProgress?(): boolean {
		throw new Error("Method not implemented.");
	}
}

class MockFluidDataStoreContext implements IModifiableFluidDataStoreContext {
	public isLocalDataStore: boolean = true;
	public packagePath: readonly string[] = undefined as any;
	public options: ILoaderOptions = undefined as any;
	public clientId: string | undefined = "123";
	public clientDetails: IClientDetails = undefined as any;
	public connected: boolean = true;
	public baseSnapshot: ISnapshotTree | undefined;
	public deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> =
		undefined as any;
	public containerRuntime: IContainerRuntimeBase = undefined as any;
	public storage: IDocumentStorageService = undefined as any;
	public IFluidDataStoreRegistry: IFluidDataStoreRegistry = undefined as any;
	public IFluidHandleContext: IFluidHandleContext = undefined as any;
	public idCompressor: IIdCompressorCore & IIdCompressor = undefined as any;

	/**
	 * Indicates the attachment state of the data store to a host service.
	 */
	public attachState: AttachState = undefined as any;

	/**
	 * @deprecated 0.16 Issue #1635, #3631
	 */
	public createProps?: any;
	public scope: FluidObject = undefined as any;

	constructor(
		public readonly id: string = "abc",
		public readonly existing: boolean = false,
		public readonly logger: ITelemetryLoggerExt = createChildLogger({
			namespace: "fluid:MockFluidDataStoreContext",
		}),
	) {}
	summarizerNode: ISummarizerNodeWithGC = new MockSummarizerNode();
	addedGCOutboundReference?(srcHandle: IFluidHandle, outboundHandle: IFluidHandle): void {
		throw new Error("Method not implemented.");
	}

	on(event: string | symbol, listener: (...args: any[]) => void): this {
		switch (event) {
			case "attaching":
			case "attached":
				return this;
			default:
				throw new Error("Method not implemented.");
		}
	}

	once(event: string | symbol, listener: (...args: any[]) => void): this {
		return this;
	}

	off(event: string | symbol, listener: (...args: any[]) => void): this {
		throw new Error("Method not implemented.");
	}

	public ensureNoDataModelChanges<T>(callback: () => T): T {
		return callback();
	}

	public getQuorum(): IQuorumClients {
		return undefined as any as IQuorumClients;
	}

	public getAudience(): IAudience {
		return undefined as any as IAudience;
	}

	public submitMessage(type: string, content: any, localOpMetadata: unknown): void {
		throw new Error("Method not implemented.");
	}

	public submitSignal(type: string, content: any): void {
		throw new Error("Method not implemented.");
	}

	public makeLocallyVisible(): void {
		throw new Error("Method not implemented.");
	}

	public bindToContext(): void {
		throw new Error("Method not implemented.");
	}

	public setChannelDirty(address: string): void {
		throw new Error("Method not implemented.");
	}

	public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
		throw new Error("Method not implemented.");
	}

	public getCreateChildSummarizerNodeFn(
		id: string,
		createParam: CreateChildSummarizerNodeParam,
	): CreateChildSummarizerNodeFn {
		throw new Error("Method not implemented.");
	}

	public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
		throw new Error("Method not implemented.");
	}

	public async getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase> {
		throw new Error("Method not implemented.");
	}
}

describe("FluidDataStoreRuntime Tests", () => {
	let dataStoreContext: MockFluidDataStoreContext;
	let sharedObjectRegistry: ISharedObjectRegistry;
	function createRuntime(
		context: IModifiableFluidDataStoreContext,
		registry: ISharedObjectRegistry,
		entrypointInitializationFn?: (rt: IFluidDataStoreRuntime) => Promise<FluidObject>,
	): HotSwapFluidDataStoreRuntime {
		return new HotSwapFluidDataStoreRuntime(
			context,
			registry,
			/* existing */ false,
			entrypointInitializationFn ??
				(async (dataStoreRuntime) => requestFluidObject(dataStoreRuntime, "/")),
		);
	}

	beforeEach(() => {
		dataStoreContext = new MockFluidDataStoreContext();
		// back-compat 0.38 - DataStoreRuntime looks in container runtime for certain properties that are unavailable
		// in the data store context.
		dataStoreContext.containerRuntime = {} as unknown as IContainerRuntimeBase;
		sharedObjectRegistry = {
			get(name: string) {
				throw new Error("Not implemented");
			},
		};
	});

	it("FluidDataStoreRuntime.load rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		dataStoreContext = new MockFluidDataStoreContext(invalidId);
		const codeBlock = () =>
			FluidDataStoreRuntime.load(
				dataStoreContext,
				sharedObjectRegistry,
				/* existing */ false,
			);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(
				e,
				"Id cannot contain slashes. DataStoreContext should have validated this.",
			),
		);
	});

	it("constructor rejects ids with forward slashes", () => {
		const invalidId = "beforeSlash/afterSlash";
		dataStoreContext = new MockFluidDataStoreContext(invalidId);
		const codeBlock = () =>
			new FluidDataStoreRuntime(
				dataStoreContext,
				sharedObjectRegistry,
				false,
				async (dataStoreRuntime) => {
					throw new Error("This shouldn't be called during the test");
				},
			);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(
				e,
				"Id cannot contain slashes. DataStoreContext should have validated this.",
			),
		);
	});

	it("can create a data store runtime", () => {
		let failed: boolean = false;
		let dataStoreRuntime: FluidDataStoreRuntime | undefined;
		try {
			dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		} catch (error) {
			failed = true;
		}
		assert.strictEqual(failed, false, "Data store runtime creation failed");
		assert.strictEqual(
			dataStoreRuntime?.id,
			dataStoreContext.id,
			"Data store runtime's id in incorrect",
		);
	});

	it("can summarize an empty data store runtime", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const summarizeResult = await dataStoreRuntime.summarize(true, false);
		assert(
			summarizeResult.summary.type === SummaryType.Tree,
			"Data store runtime did not return a summary tree",
		);
		assert(
			Object.keys(summarizeResult.summary.tree).length === 0,
			"The summary should be empty",
		);
	});

	it("can get GC data of an empty data store runtime", async () => {
		// The GC data should have a single node for the data store runtime with empty outbound routes.
		const expectedGCData: IGarbageCollectionData = {
			gcNodes: { "/": [] },
		};
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const gcData = await dataStoreRuntime.getGCData();
		assert.deepStrictEqual(gcData, expectedGCData, "The GC data is incorrect");
	});

	it("createChannel rejects ids with slashes", async () => {
		const dataStoreRuntime = createRuntime(dataStoreContext, sharedObjectRegistry);
		const invalidId = "beforeSlash/afterSlash";
		const codeBlock = (): IChannel => dataStoreRuntime.createChannel(invalidId, "SomeType");
		assert.throws(
			codeBlock,
			(e: IErrorBase) =>
				e.errorType === ContainerErrorType.usageError &&
				e.message === `Id cannot contain slashes: ${invalidId}`,
		);
	});

	it("entryPoint is initialized correctly", async () => {
		const myObj: FluidObject = { fakeProp: "fakeValue" };
		const dataStoreRuntime = createRuntime(
			dataStoreContext,
			sharedObjectRegistry,
			async (dsRuntime) => myObj,
		);
		assert(
			(await dataStoreRuntime.entryPoint?.get()) === myObj,
			"entryPoint was not initialized",
		);
	});
});
