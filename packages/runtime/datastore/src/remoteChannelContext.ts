/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, LazyPromise } from "@fluidframework/common-utils";
import { CreateContainerError, DataCorruptionError } from "@fluidframework/container-utils";
import {
    IChannel,
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import {
    CreateChildSummarizerNodeFn,
    IContextSummarizeResult,
    IFluidDataStoreContext,
    IGCData,
    IGCDetails,
    ISummarizeInternalResult,
    ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions";
import {
    attributesBlobKey,
    createServiceEndpoints,
    gcBlobKey,
    IChannelContext,
    summarizeChannel,
} from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { ISharedObjectRegistry } from "./dataStoreRuntime";
import { debug } from "./debug";

interface IPendingProcess {
    type: "process";
    message: ISequencedDocumentMessage;
    local: boolean;
    localOpMetadata: unknown;
}

interface IPendingRebase {
    type: "rebase";
    message: ISequencedDocumentMessage;
    localOpMetadata: unknown;
}

type IPendingAction = IPendingProcess | IPendingRebase;

export class RemoteChannelContext implements IChannelContext {
    private isLoaded = false;
    private pending: IPendingAction[] | undefined = [];
    private channelP: Promise<IChannel> | undefined;
    private channel: IChannel | undefined;
    private readonly services: {
        readonly deltaConnection: ChannelDeltaConnection,
        readonly objectStorage: ChannelStorageService,
    };
    private readonly summarizerNode: ISummarizerNodeWithGC;

    /**
     * This loads the GC details from the base snapshot of this context.
     */
    private readonly initialGCDetailsP = new LazyPromise<IGCDetails>(async () => {
        if (await this.services.objectStorage.contains(gcBlobKey)) {
            return readAndParse<IGCDetails>(this.services.objectStorage, gcBlobKey);
        } else {
            // Default value of initial GC details in case the initial snapshot does not have GC details blob.
            return {};
        }
    });

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly dataStoreContext: IFluidDataStoreContext,
        storageService: IDocumentStorageService,
        submitFn: (content: any, localOpMetadata: unknown) => void,
        dirtyFn: (address: string) => void,
        private readonly id: string,
        baseSnapshot:  ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        extraBlobs: Map<string, string> | undefined,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        private readonly attachMessageType?: string,
    ) {
        this.services = createServiceEndpoints(
            this.id,
            this.dataStoreContext.connected,
            submitFn,
            () => dirtyFn(this.id),
            storageService,
            baseSnapshot,
            extraBlobs);

        const thisSummarizeInternal =
            async (fullTree: boolean, trackState: boolean) => this.summarizeInternal(fullTree, trackState);
        this.summarizerNode = createSummarizerNode(
            thisSummarizeInternal,
            async () => this.getGCDataInternal(),
            async () => this.getInitialGCData(),
        );
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getChannel(): Promise<IChannel> {
        if (this.channelP === undefined) {
            this.channelP = this.loadChannel();
        }

        return this.channelP;
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        // Connection events are ignored if the data store is not yet loaded
        if (!this.isLoaded) {
            return;
        }

        this.services.deltaConnection.setConnectionState(connected);
    }

    public rebaseOp(message: ISequencedDocumentMessage, localOpMetadata: unknown) {
        if (this.isLoaded) {
            this.services.deltaConnection.rebaseOp(message, localOpMetadata);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push({ type: "rebase", message, localOpMetadata });
        }
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.summarizerNode.invalidate(message.sequenceNumber);

        if (this.isLoaded) {
            this.services.deltaConnection.process(message, local, localOpMetadata);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push({ type: "process", message, local, localOpMetadata });
        }
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded, "Remote channel must be loaded when resubmitting op");
        this.services.deltaConnection.reSubmit(content, localOpMetadata);
    }

    /**
     * Returns a summary at the current sequence number.
     * @param fullTree - true to bypass optimizations and force a full summary tree
     * @param trackState - This tells whether we should track state from this summary.
     */
    public async summarize(fullTree: boolean = false, trackState: boolean = true): Promise<IContextSummarizeResult> {
        return this.summarizerNode.summarize(fullTree, trackState);
    }

    private async summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        const channel = await this.getChannel();
        const summarizeResult = summarizeChannel(channel, fullTree, trackState);
        return { ...summarizeResult, id: this.id };
    }

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded, "Remote channel must not already be loaded when loading");

        let attributes: IChannelAttributes | undefined;
        if (await this.services.objectStorage.contains(attributesBlobKey)) {
            attributes = await readAndParse<IChannelAttributes | undefined>(
                this.services.objectStorage,
                attributesBlobKey);
        }

        let factory: IChannelFactory | undefined;
        // this is a back-compat case where
        // the attach message doesn't include
        // the attributes. Since old attach messages
        // will not have attributes we need to keep
        // this as long as we support old attach messages
        if (attributes === undefined) {
            if (this.attachMessageType === undefined) {
                // TODO: Strip out potential PII content #1920
                throw new DataCorruptionError("Channel type not available", {
                    channelId: this.id,
                    dataStoreId: this.dataStoreContext.id,
                    dataStorePackagePath: this.dataStoreContext.packagePath.join("/"),
                });
            }
            factory = this.registry.get(this.attachMessageType);
            if (factory === undefined) {
                // TODO: Strip out potential PII content #1920
                throw new DataCorruptionError(`Channel Factory ${this.attachMessageType} for attach not registered`, {
                    channelId: this.id,
                    dataStoreId: this.dataStoreContext.id,
                    dataStorePackagePath: this.dataStoreContext.packagePath.join("/"),
                    channelFactoryType: this.attachMessageType,
                });
            }
            attributes = factory.attributes;
        } else {
            factory = this.registry.get(attributes.type);
            if (factory === undefined) {
                // TODO: Strip out potential PII content #1920
                throw new DataCorruptionError(`Channel Factory ${attributes.type} not registered`, {
                    channelId: this.id,
                    dataStoreId: this.dataStoreContext.id,
                    dataStorePackagePath: this.dataStoreContext.packagePath.join("/"),
                    channelFactoryType: attributes.type,
                });
            }
        }

        // Compare snapshot version to collaborative object version
        if (attributes.snapshotFormatVersion !== undefined
            && attributes.snapshotFormatVersion !== factory.attributes.snapshotFormatVersion) {
            debug(`Snapshot version mismatch. Type: ${attributes.type}, ` +
                `Snapshot format@pkg version: ${attributes.snapshotFormatVersion}@${attributes.packageVersion}, ` +
                // eslint-disable-next-line max-len
                `client format@pkg version: ${factory.attributes.snapshotFormatVersion}@${factory.attributes.packageVersion}`);
        }

        // eslint-disable-next-line max-len
        debug(`Loading channel ${attributes.type}@${factory.attributes.packageVersion}, snapshot format version: ${attributes.snapshotFormatVersion}`);

        const channel = await factory.load(
            this.runtime,
            this.id,
            this.services,
            attributes);

        // Send all pending messages to the channel
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const message of this.pending!) {
            try {
                switch (message.type) {
                    case "process":
                        this.services.deltaConnection.process(message.message, message.local, message.localOpMetadata);
                        break;
                    case "rebase":
                        this.services.deltaConnection.rebaseOp(message.message, message.localOpMetadata);
                        break;
                    default:
                }
            } catch (err) {
                // record sequence number for easier debugging
                const error = CreateContainerError(err);
                if (message.type === "process") {
                    error.sequenceNumber = message.message.sequenceNumber;
                }
                throw error;
            }
        }

        // Commit changes.
        this.channel = channel;
        this.pending = undefined;
        this.isLoaded = true;

        // Because have some await between we created the service and here, the connection state might have changed
        // and we don't propagate the connection state when we are not loaded.  So we have to set it again here.
        this.services.deltaConnection.setConnectionState(this.dataStoreContext.connected);
        return this.channel;
    }

    public async getGCData(): Promise<IGCData> {
        return this.summarizerNode.getGCData();
    }

    private async getGCDataInternal(): Promise<IGCData> {
        const channel = await this.getChannel();
        return channel.getGCData();
    }

    /**
     * This returns the GC data in the initial GC details of this context.
     */
    private async getInitialGCData(): Promise<IGCData | undefined> {
        return (await this.initialGCDetailsP).gcData;
    }
}
