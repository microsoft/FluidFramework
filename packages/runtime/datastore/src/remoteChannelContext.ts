/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { CreateContainerError } from "@fluidframework/container-utils";
import { readAndParse } from "@fluidframework/driver-utils";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
} from "@fluidframework/protocol-definitions";
import {
    IChannel,
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
    IFluidDataStoreContext,
    ISummaryTracker,
    ISummarizeResult,
    ISummarizerNode,
    CreateChildSummarizerNodeFn,
    ISummarizeInternalResult,
} from "@fluidframework/runtime-definitions";
import { convertToSummaryTree } from "@fluidframework/runtime-utils";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./dataStoreRuntime";
import { debug } from "./debug";
import { ChannelStorageService } from "./channelStorageService";

export class RemoteChannelContext implements IChannelContext {
    private isLoaded = false;
    private pending: ISequencedDocumentMessage[] | undefined = [];
    private channelP: Promise<IChannel> | undefined;
    private channel: IChannel | undefined;
    private readonly services: {
        readonly deltaConnection: ChannelDeltaConnection,
        readonly objectStorage: ChannelStorageService,
    };
    private readonly summarizerNode: ISummarizerNode;
    constructor(
        private readonly runtime: IFluidDataStoreRuntime,
        private readonly dataStoreContext: IFluidDataStoreContext,
        storageService: IDocumentStorageService,
        submitFn: (content: any, localOpMetadata: unknown) => void,
        dirtyFn: (address: string) => void,
        private readonly id: string,
        baseSnapshot: Promise<ISnapshotTree> | ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        extraBlobs: Promise<Map<string, string>> | undefined,
        private readonly branch: string,
        private readonly summaryTracker: ISummaryTracker,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        private readonly attachMessageType?: string,
    ) {
        this.services = createServiceEndpoints(
            this.id,
            this.dataStoreContext.connected,
            submitFn,
            () => dirtyFn(this.id),
            storageService,
            Promise.resolve(baseSnapshot),
            extraBlobs);

        // Summarizer node always tracks summary state. Set trackState to true.
        const thisSummarizeInternal =
            async (fullTree: boolean) => this.summarizeInternal(fullTree, true /* trackState */);
        this.summarizerNode = createSummarizerNode(thisSummarizeInternal);
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
        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);
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
    public async summarize(fullTree: boolean = false, trackState: boolean = true): Promise<ISummarizeResult> {
        // Summarizer node tracks the state from the summary. If trackState is true, use summarizer node to get
        // the summary. Else, get the summary tree directly.
        return trackState
            ? this.summarizerNode.summarize(fullTree)
            : this.summarizeInternal(fullTree, false /* trackState */);
    }

    private async summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        const channel = await this.getChannel();
        const snapshotTree = snapshotChannel(channel);
        const summaryResult = convertToSummaryTree(snapshotTree, fullTree);
        return { ...summaryResult, id: this.id };
    }

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded, "Remote channel must not already be loaded when loading");

        let attributes: IChannelAttributes | undefined;
        if (await this.services.objectStorage.contains(".attributes")) {
            attributes = await readAndParse<IChannelAttributes | undefined>(
                this.services.objectStorage,
                ".attributes");
        }

        let factory: IChannelFactory | undefined;
        // this is a back-compat case where
        // the attach message doesn't include
        // the attributes. Since old attach messages
        // will not have attributes we need to keep
        // this as long as we support old attach messages
        if (attributes === undefined) {
            if (this.attachMessageType === undefined) {
                throw new Error("Channel type not available");
            }
            factory = this.registry.get(this.attachMessageType);
            if (factory === undefined) {
                throw new Error(`Channel Factory ${this.attachMessageType} for attach not registered`);
            }
            attributes = factory.attributes;
        } else {
            factory = this.registry.get(attributes.type);
            if (factory === undefined) {
                throw new Error(`Channel Factory ${attributes.type} not registered`);
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
            this.branch,
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
}
