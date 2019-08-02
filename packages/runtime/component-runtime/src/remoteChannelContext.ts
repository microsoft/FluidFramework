/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@prague/container-definitions";
import {
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@prague/protocol-definitions";
import {
    IChannel,
    IChannelAttributes,
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";
import { readAndParse } from "@prague/utils";
import * as assert from "assert";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./componentRuntime";
import { debug } from "./debug";

export class RemoteChannelContext implements IChannelContext {
    private connection: ChannelDeltaConnection;
    private baseId: string;
    private isLoaded = false;
    private pending = new Array<ISequencedDocumentMessage>();
    private channelP: Promise<IChannel>;
    private channel: IChannel;

    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly componentContext: IComponentContext,
        private readonly storageService: IDocumentStorageService,
        private readonly submitFn: (type: MessageType, content: any) => number,
        private readonly id: string,
        private readonly tree: ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        private readonly extraBlobs: Map<string, string>,
        private readonly branch: string,
        private readonly minimumSequenceNumber: number,
        private readonly attributes: IChannelAttributes | undefined,
    ) {
    }

    public getChannel(): Promise<IChannel> {
        if (!this.channelP) {
            this.channelP = this.loadChannel();
        }

        return this.channelP;
    }

    public isRegistered(): boolean {
        // A remote channel by definition is registered
        return true;
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        // Connection events are ignored if the component is not yet loaded
        if (!this.isLoaded) {
            return;
        }

        this.connection.setConnectionState(value);
    }

    public async prepareOp(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        // Wait for realization to complete if in process
        if (this.channelP) {
            await this.channelP;
        }

        // Then either prepare the message or resolve empty (since we will do it later)
        return this.isLoaded
            ? this.connection.prepare(message, local)
            : Promise.resolve();
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        if (this.isLoaded) {
            // Clear base id since the channel is now dirty
            this.baseId = null;
            this.connection.process(message, local, context);
        } else {
            assert(!local);
            this.pending.push(message);
        }
    }

    public async snapshot(): Promise<ITree> {
        const channel = await this.getChannel();
        return snapshotChannel(channel, this.baseId);
    }

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded);

        // Create the channel if it hasn't already been passed in the constructor
        const { type, snapshotFormatVersion } = this.attributes
            ? this.attributes
            : await readAndParse<IChannelAttributes>(
                this.storageService,
                this.tree.blobs[".attributes"]);

        // Pass the transformedMessages - but the object really should be storing this
        const extension = this.registry.get(type);
        if (!extension) {
            throw new Error(`Channel Extension ${type} not registered`);
        }

        // compare snapshot version to collaborative object version
        if (snapshotFormatVersion !== undefined && snapshotFormatVersion !== extension.snapshotFormatVersion) {
            debug(`Snapshot version mismatch. Type: ${type}, ` +
                `Snapshot format version: ${snapshotFormatVersion}, ` +
                `client format version: ${extension.snapshotFormatVersion}`);
        }

        const services = createServiceEndpoints(
            this.id,
            this.componentContext.connectionState,
            this.submitFn,
            this.storageService,
            this.tree,
            this.extraBlobs);
        this.channel = await extension.load(
            this.runtime,
            this.id,
            this.minimumSequenceNumber,
            services,
            this.branch);
        this.connection = services.deltaConnection;

        // Send all pending messages to the channel
        for (const message of this.pending) {
            const context = await this.connection.prepare(message, false);
            this.connection.process(message, false, context);
        }
        this.pending = undefined;
        this.isLoaded = true;

        // Because have some await between we created the service and here, the connection state might have changed
        // and we don't propagate the connection state when we are not loaded.  So we have to set it again here.
        this.connection.setConnectionState(this.componentContext.connectionState);
        return this.channel;
    }
}
