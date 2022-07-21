/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { DataCorruptionError } from "@fluidframework/container-utils";
import { IFluidHandle } from "@fluidframework/core-interfaces";
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
    IFluidDataStoreContext,
    IGarbageCollectionData,
    IGarbageCollectionDetailsBase,
    ISummarizeInternalResult,
    ISummarizeResult,
    ISummarizerNodeWithGC,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { ChildLogger, TelemetryDataTag, ThresholdCounter } from "@fluidframework/telemetry-utils";
import {
    attributesBlobKey,
    createServiceEndpoints,
    IChannelContext,
    summarizeChannelAsync,
} from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
import { ISharedObjectRegistry } from "./dataStoreRuntime";

export class RemoteChannelContext implements IChannelContext {
    private isLoaded = false;
    private pending: ISequencedDocumentMessage[] | undefined = [];
    private channelP: Promise<IChannel> | undefined;
    private channel: IChannel | undefined;
    private readonly services: {
        readonly deltaConnection: ChannelDeltaConnection;
        readonly objectStorage: ChannelStorageService;
    };
    private readonly summarizerNode: ISummarizerNodeWithGC;
    private readonly subLogger: ITelemetryLogger;
    private readonly thresholdOpsCounter: ThresholdCounter;
    private static readonly pendingOpsCountThreshold = 1000;

    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly dataStoreContext: IFluidDataStoreContext,
        storageService: IDocumentStorageService,
        submitFn: (content: any, localOpMetadata: unknown) => void,
        dirtyFn: (address: string) => void,
        addedGCOutboundReferenceFn: (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) => void,
        private readonly id: string,
        baseSnapshot: ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        extraBlobs: Map<string, ArrayBufferLike> | undefined,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        getBaseGCDetails: () => Promise<IGarbageCollectionDetailsBase>,
        private readonly attachMessageType?: string,
    ) {
        assert(!this.id.includes("/"), 0x310 /* Channel context ID cannot contain slashes */);

        this.subLogger = ChildLogger.create(this.runtime.logger, "RemoteChannelContext");

        this.services = createServiceEndpoints(
            this.id,
            this.dataStoreContext.connected,
            submitFn,
            () => dirtyFn(this.id),
            addedGCOutboundReferenceFn,
            storageService,
            this.subLogger,
            baseSnapshot,
            extraBlobs);

        const thisSummarizeInternal =
            async (fullTree: boolean, trackState: boolean, telemetryContext?: ITelemetryContext) =>
            this.summarizeInternal(fullTree, trackState, telemetryContext);

        this.summarizerNode = createSummarizerNode(
            thisSummarizeInternal,
            async (fullGC?: boolean) => this.getGCDataInternal(fullGC),
            async () => getBaseGCDetails(),
        );

        this.thresholdOpsCounter = new ThresholdCounter(
            RemoteChannelContext.pendingOpsCountThreshold,
            this.subLogger,
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
            assert(this.pending !== undefined, 0x23e /* "pending is undefined" */);
            this.pending.push(message);
            this.thresholdOpsCounter.sendIfMultiple("StorePendingOps", this.pending.length);
        }
    }

    public reSubmit(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded, 0x196 /* "Remote channel must be loaded when resubmitting op" */);

        this.services.deltaConnection.reSubmit(content, localOpMetadata);
    }

    public rollback(content: any, localOpMetadata: unknown) {
        assert(this.isLoaded, 0x2f0 /* "Remote channel must be loaded when rolling back op" */);

        this.services.deltaConnection.rollback(content, localOpMetadata);
    }

    /**
     * Returns a summary at the current sequence number.
     * @param fullTree - true to bypass optimizations and force a full summary tree
     * @param trackState - This tells whether we should track state from this summary.
     * @param telemetryContext - summary data passed through the layers for telemetry purposes
     */
    public async summarize(
        fullTree: boolean = false,
        trackState: boolean = true,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummarizeResult> {
        return this.summarizerNode.summarize(fullTree, trackState, telemetryContext);
    }

    private async summarizeInternal(
        fullTree: boolean,
        trackState: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummarizeInternalResult> {
        const channel = await this.getChannel();
        const summarizeResult = await summarizeChannelAsync(channel, fullTree, trackState, telemetryContext);
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
                // TODO: dataStoreId may require a different tag from PackageData #7488
                throw new DataCorruptionError("channelTypeNotAvailable", {
                    channelId: {
                        value: this.id,
                        tag: TelemetryDataTag.CodeArtifact,
                    },
                    dataStoreId: {
                        value: this.dataStoreContext.id,
                        tag: TelemetryDataTag.CodeArtifact,
                    },
                    dataStorePackagePath: this.dataStoreContext.packagePath.join("/"),
                });
            }
            factory = this.registry.get(this.attachMessageType);
            if (factory === undefined) {
                // TODO: dataStoreId may require a different tag from PackageData #7488
                throw new DataCorruptionError("channelFactoryNotRegisteredForAttachMessageType", {
                    channelId: {
                        value: this.id,
                        tag: TelemetryDataTag.CodeArtifact,
                    },
                    dataStoreId: {
                        value: this.dataStoreContext.id,
                        tag: TelemetryDataTag.CodeArtifact,
                    },
                    dataStorePackagePath: this.dataStoreContext.packagePath.join("/"),
                    channelFactoryType: this.attachMessageType,
                });
            }
            attributes = factory.attributes;
        } else {
            factory = this.registry.get(attributes.type);
            if (factory === undefined) {
                // TODO: dataStoreId may require a different tag from PackageData #7488
                throw new DataCorruptionError("channelFactoryNotRegisteredForGivenType", {
                    channelId: {
                        value: this.id,
                        tag: TelemetryDataTag.CodeArtifact,
                    },
                    dataStoreId: {
                        value: this.dataStoreContext.id,
                        tag: TelemetryDataTag.CodeArtifact,
                    },
                    dataStorePackagePath: this.dataStoreContext.packagePath.join("/"),
                    channelFactoryType: attributes.type,
                });
            }
        }

        // Compare snapshot version to collaborative object version
        if (attributes.snapshotFormatVersion !== undefined
            && attributes.snapshotFormatVersion !== factory.attributes.snapshotFormatVersion) {
                this.subLogger.sendTelemetryEvent(
                    {
                        eventName: "ChannelAttributesVersionMismatch",
                        channelType: { value: attributes.type, tag: TelemetryDataTag.CodeArtifact },
                        channelSnapshotVersion: {
                            value: `${attributes.snapshotFormatVersion}@${attributes.packageVersion}`,
                            tag: TelemetryDataTag.CodeArtifact,
                        },
                        channelCodeVersion: {
                            value: `${factory.attributes.snapshotFormatVersion}@${factory.attributes.packageVersion}`,
                            tag: TelemetryDataTag.CodeArtifact,
                        },
                    },
                );
        }

        const channel = await factory.load(
            this.runtime,
            this.id,
            this.services,
            attributes);

        // Send all pending messages to the channel
        assert(this.pending !== undefined, 0x23f /* "pending undefined" */);
        for (const message of this.pending) {
            this.services.deltaConnection.process(message, false, undefined /* localOpMetadata */);
        }
        this.thresholdOpsCounter.send("ProcessPendingOps", this.pending.length);

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

    public updateUsedRoutes(usedRoutes: string[], gcTimestamp?: number) {
        /**
         * Currently, DDSes are always considered referenced and are not garbage collected. Update the summarizer node's
         * used routes to contain a route to this channel context.
         * Once we have GC at DDS level, this will be updated to use the passed usedRoutes. See -
         * https://github.com/microsoft/FluidFramework/issues/4611
         */
        this.summarizerNode.updateUsedRoutes([""]);
    }
}
