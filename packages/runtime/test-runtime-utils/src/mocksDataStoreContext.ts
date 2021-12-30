/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidHandle,
    IFluidHandleContext,
    FluidObject,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IDeltaManager,
    ContainerWarning,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";

import { DebugLogger } from "@fluidframework/telemetry-utils";
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
    IGarbageCollectionSummaryDetails,
} from "@fluidframework/runtime-definitions";
import { v4 as uuid } from "uuid";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";

export class MockFluidDataStoreContext implements IFluidDataStoreContext {
    public documentId: string;
    public isLocalDataStore: boolean = true;
    public packagePath: readonly string[];
    public options: ILoaderOptions;
    public clientId: string | undefined = uuid();
    public clientDetails: IClientDetails;
    public connected: boolean = true;
    public baseSnapshot: ISnapshotTree | undefined;
    public deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    public containerRuntime: IContainerRuntimeBase;
    public storage: IDocumentStorageService;
    public IFluidDataStoreRegistry: IFluidDataStoreRegistry;
    public IFluidHandleContext: IFluidHandleContext;

    /**
     * Indicates the attachment state of the data store to a host service.
     */
    public attachState: AttachState;

    /**
     * @deprecated 0.16 Issue #1635, #3631
     */
    public createProps?: any;
    public scope: FluidObject;

    constructor(
        public readonly id: string = uuid(),
        public readonly existing: boolean = false,
        public readonly logger: ITelemetryLogger = DebugLogger.create("fluid:MockFluidDataStoreContext"),
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

    public getQuorum(): IQuorumClients {
        return;
    }

    public getAudience(): IAudience {
        return;
    }

    public raiseContainerWarning(warning: ContainerWarning): void {
        throw new Error("Method not implemented.");
    }

    public submitMessage(type: string, content: any, localOpMetadata: unknown): void {
        throw new Error("Method not implemented.");
    }

    public submitSignal(type: string, content: any): void {
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

    public async getInitialGCSummaryDetails(): Promise<IGarbageCollectionSummaryDetails> {
        throw new Error("Method not implemented.");
    }
}
