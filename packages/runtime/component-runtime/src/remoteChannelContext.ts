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
    private connection: ChannelDeltaConnection | undefined;
    private baseId: string | null = null;
    private isLoaded = false;
    private pending: ISequencedDocumentMessage[] | undefined = [];
    private channelP: Promise<IChannel> | undefined;
    private channel: IChannel | undefined;

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

        // tslint:disable-next-line: no-non-null-assertion
        this.connection!.setConnectionState(value);
    }

    public async prepareOp(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        // Wait for realization to complete if in process
        if (this.channelP) {
            await this.channelP;
        }

        // Then either prepare the message or resolve empty (since we will do it later)
        return this.isLoaded
            // tslint:disable-next-line: no-non-null-assertion
            ? this.connection!.prepare(message, local)
            : Promise.resolve();
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        if (this.isLoaded) {
            // Clear base id since the channel is now dirty
            this.baseId = null;
            // tslint:disable-next-line: no-non-null-assertion
            this.connection!.process(message, local, context);
        } else {
            assert(!local);
            // tslint:disable-next-line: no-non-null-assertion
            this.pending!.push(message);
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
        const factory = this.registry.get(type);
        if (!factory) {
            throw new Error(`Channel Factory ${type} not registered`);
        }

        // compare snapshot version to collaborative object version
        if (snapshotFormatVersion !== undefined && snapshotFormatVersion !== factory.snapshotFormatVersion) {
            debug(`Snapshot version mismatch. Type: ${type}, ` +
                `Snapshot format version: ${snapshotFormatVersion}, ` +
                `client format version: ${factory.snapshotFormatVersion}`);
        }

        const services = createServiceEndpoints(
            this.id,
            this.componentContext.connectionState,
            this.submitFn,
            this.storageService,
            this.tree,
            this.extraBlobs);
        this.channel = await factory.load(
            this.runtime,
            this.id,
            services,
            this.branch);

        const connection = services.deltaConnection;
        this.connection = connection;

        // Send all pending messages to the channel
        // tslint:disable-next-line: no-non-null-assertion
        for (const message of this.pending!) {
            const context = await connection.prepare(message, false);
            connection.process(message, false, context);
        }
        this.pending = undefined;
        this.isLoaded = true;

        // Because have some await between we created the service and here, the connection state might have changed
        // and we don't propagate the connection state when we are not loaded.  So we have to set it again here.
        this.connection.setConnectionState(this.componentContext.connectionState);
        return this.channel;
    }
}
