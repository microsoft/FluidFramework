/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { DataCorruptionError } from "@fluidframework/container-utils";
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

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly dataStoreContext: IFluidDataStoreContext,
        storageService: IDocumentStorageService,
        submitFn: (content: any, localOpMetadata: unknown) => void,
        dirtyFn: (address: string) => void,
        private readonly id: string,
        baseSnapshot:  ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        extraBlobs: Map<string, ArrayBufferLike> | undefined,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        gcDetailsInInitialSummary: () => Promise<IGarbageCollectionSummaryDetails>,
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
            async (fullGC?: boolean) => this.getGCDataInternal(fullGC),
            async () => gcDetailsInInitialSummary(),
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

    public applyStashedOp(message: ISequencedDocumentMessage): unknown {
        assert(this.isLoaded, 0x194 /* "Remote channel must be loaded when rebasing op" */);
        return this.services.deltaConnection.applyStashedOp(message);
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.summarizerNode.invalidate(message.sequenceNumber);

        if (this.isLoaded) {
            this.services.deltaConnection.process(message, local, localOpMetadata);
        } else {
            assert(!local, 0x195 /* "Remote channel must not be local when processing op" */);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push(message);
        }
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded, 0x196 /* "Remote channel must be loaded when resubmitting op" */);

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
        assert(!this.isLoaded, 0x197 /* "Remote channel must not already be loaded when loading" */);

        let attributes: IChannelAttributes | undefined;
        if (await this.services.objectStorage.contains(attributesBlobKey)) {
            attributes = await readAndParse<IChannelAttributes | undefined>(
                this.services.objectStorage,
                attributesBlobKey);
        }

        let factory: IChannelFactory | undefined;
        // this is a backward compatibility case where
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

        const channel = await factory.load(
            this.runtime,
            this.id,
            this.services,
            attributes);

        // Send all pending messages to the channel
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const message of this.pending!) {
            this.services.deltaConnection.process(message, false, undefined /* localOpMetadata */);
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

    /**
     * Returns the data used for garbage collection. This includes a list of GC nodes that represent this context.
     * Each node has a set of outbound routes to other GC nodes in the document.
     * If there is no new data in this context since the last summary, previous GC data is used.
     * If there is new data, the GC data is generated again (by calling getGCDataInternal).
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        return this.summarizerNode.getGCData(fullGC);
    }

    /**
     * Generates the data used for garbage collection. This is called when there is new data since last summary. It
     * loads the context and calls into the channel to get its GC data.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    private async getGCDataInternal(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        const channel = await this.getChannel();
        return channel.getGCData(fullGC);
    }

    /**
     * After GC has run, called to notify the context of routes used in it. These are used for the following:
     * 1. To identify if this context is being referenced in the document or not.
     * 2. To determine if it needs to re-summarize in case used routes changed since last summary.
     * 3. These are added to the summary generated by the context.
     * @param usedRoutes - The routes that are used in this context.
     */
    public updateUsedRoutes(usedRoutes: string[]) {
        /**
         * Currently, DDSs are always considered referenced and are not garbage collected. Update the summarizer node's
         * used routes to contain a route to this channel context.
         * Once we have GC at DDS level, this will be updated to use the passed usedRoutes. See -
         * https://github.com/microsoft/FluidFramework/issues/4611
         */
        this.summarizerNode.updateUsedRoutes([""]);
    }
}
