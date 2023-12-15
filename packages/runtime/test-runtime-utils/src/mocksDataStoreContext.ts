/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLoggerExt, createChildLogger } from "@fluidframework/telemetry-utils";
import { IFluidHandle, IFluidHandleContext, FluidObject } from "@fluidframework/core-interfaces";
import {
	IAudience,
	IDeltaManager,
	AttachState,
	ILoaderOptions,
} from "@fluidframework/container-definitions";

import {
	IClientDetails,
	IDocumentMessage,
	IQuorumClients,
	ISequencedDocumentMessage,
	ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import {
	CreateChildSummarizerNodeFn,
	CreateChildSummarizerNodeParam,
	IContainerRuntimeBase,
	IFluidDataStoreContext,
	IFluidDataStoreRegistry,
	IGarbageCollectionDetailsBase,
} from "@fluidframework/runtime-definitions";
import { IIdCompressor, IIdCompressorCore } from "@fluidframework/id-compressor";
import { v4 as uuid } from "uuid";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";

/**
 * @alpha
 */
export class MockFluidDataStoreContext implements IFluidDataStoreContext {
	public isLocalDataStore: boolean = true;
	public packagePath: readonly string[] = undefined as any;
	public options: ILoaderOptions = undefined as any;
	public clientId: string | undefined = uuid();
	public clientDetails: IClientDetails = { capabilities: { interactive: this.interactive } };
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
		public readonly id: string = uuid(),
		public readonly existing: boolean = false,
		public readonly logger: ITelemetryLoggerExt = createChildLogger({
			namespace: "fluid:MockFluidDataStoreContext",
		}),
		private readonly interactive: boolean = true,
	) {}

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
