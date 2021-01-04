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
    gcBlobKey,
    IContextSummarizeResult,
    IFluidDataStoreContext,
    IGarbageCollectionData,
    IGarbageCollectionSummaryDetails,
    ISummarizeInternalResult,
    ISummarizerNodeWithGC,
} from "@fluidframework/runtime-definitions";
import {
    attributesBlobKey,
    createServiceEndpoints,
    IChannelContext,
    summarizeChannel,
} from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { ISharedObjectRegistry } from "./dataStoreRuntime";
import { debug } from "./debug";

export class RemoteChannelContext implements IChannelContext {
    private isLoaded = false;
    private pending: ISequencedDocumentMessage[] | undefined = [];
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
    private readonly gcDetailsInInitialSummaryP = new LazyPromise<IGarbageCollectionSummaryDetails>(async () => {
        if (await this.services.objectStorage.contains(gcBlobKey)) {
            return readAndParse<IGarbageCollectionSummaryDetails>(this.services.objectStorage, gcBlobKey);
        } else {
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
        usedRoutes?: string[],
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

        // If we are created before GC is run, used routes will not be available. Set self route (empty string) to
        // used routes in the summarizer node. If GC is enabled, the used routes will be updated as per the GC data.
        this.summarizerNode = createSummarizerNode(
            thisSummarizeInternal,
            async () => this.getGCDataInternal(),
            async () => this.gcDetailsInInitialSummaryP,
            usedRoutes ?? [""],
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

    public processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.summarizerNode.invalidate(message.sequenceNumber);

        if (this.isLoaded) {
            this.services.deltaConnection.process(message, local, localOpMetadata);
        } else {
            assert(!local, "Remote channel must not be local when processing op");
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push(message);
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
                this.services.deltaConnection.process(message, false, undefined /* localOpMetadata */);
            } catch (err) {
                // record sequence number for easier debugging
                const error = CreateContainerError(err);
                error.sequenceNumber = message.sequenceNumber;
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

    public async getGCData(): Promise<IGarbageCollectionData> {
        return this.summarizerNode.getGCData();
    }

    private async getGCDataInternal(): Promise<IGarbageCollectionData> {
        const channel = await this.getChannel();
        return channel.getGCData();
    }
}
