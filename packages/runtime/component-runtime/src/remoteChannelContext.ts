/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { readAndParse } from "@microsoft/fluid-driver-utils";
import {
    ConnectionState,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import {
    IChannel,
    IChannelAttributes,
    IComponentContext,
    IComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";
import { SummaryTracker } from "@microsoft/fluid-runtime-utils";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./componentRuntime";
import { debug } from "./debug";

type RequiredIChannelAttributes = Pick<IChannelAttributes, "type"> & Partial<IChannelAttributes>;

export class RemoteChannelContext implements IChannelContext {
    private connection: ChannelDeltaConnection | undefined;
    private readonly summaryTracker = new SummaryTracker();
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
        private readonly baseSnapshot: ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        private readonly extraBlobs: Map<string, string>,
        private readonly branch: string,
        private readonly attributes: RequiredIChannelAttributes | undefined,
    ) {}

    // eslint-disable-next-line @typescript-eslint/promise-function-async
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

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.connection!.setConnectionState(value);
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean): void {
        this.summaryTracker.invalidate();

        if (this.isLoaded) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.connection!.process(message, local);
        } else {
            assert(!local);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push(message);
        }
    }

    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        const baseId = this.summaryTracker.getBaseId();
        // eslint-disable-next-line no-null/no-null
        if (baseId !== null && !fullTree) {
            return { id: baseId, entries: [] };
        }
        this.summaryTracker.reset();
        const channel = await this.getChannel();
        return snapshotChannel(channel, baseId);
    }

    public refreshBaseSummary(snapshot: ISnapshotTree) {
        this.summaryTracker.setBaseTree(snapshot);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private getAttributesFromBaseTree(): Promise<RequiredIChannelAttributes> {
        return readAndParse<RequiredIChannelAttributes>(
            this.storageService,
            this.baseSnapshot.blobs[".attributes"]);
    }

    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded);

        // Create the channel if it hasn't already been passed in the constructor
        const { type, snapshotFormatVersion, packageVersion } = this.attributes
            ? this.attributes
            : await this.getAttributesFromBaseTree();

        // Pass the transformedMessages - but the object really should be storing this
        const factory = this.registry.get(type);
        if (!factory) {
            throw new Error(`Channel Factory ${type} not registered`);
        }

        // Compare snapshot version to collaborative object version
        if (snapshotFormatVersion !== undefined && snapshotFormatVersion !== factory.attributes.snapshotFormatVersion) {
            debug(`Snapshot version mismatch. Type: ${type}, ` +
                `Snapshot format version: ${snapshotFormatVersion}, ` +
                `client format version: ${factory.attributes.snapshotFormatVersion}`);
        }

        debug(`Loading channel ${type}@${packageVersion}, snapshot format version: ${snapshotFormatVersion}`);

        const services = createServiceEndpoints(
            this.id,
            this.componentContext.connectionState,
            this.submitFn,
            this.storageService,
            this.baseSnapshot,
            this.extraBlobs);
        this.channel = await factory.load(
            this.runtime,
            this.id,
            services,
            this.branch);

        const connection = services.deltaConnection;
        this.connection = connection;

        // Send all pending messages to the channel
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const message of this.pending!) {
            connection.process(message, false);
        }
        this.pending = undefined;
        this.isLoaded = true;

        // Because have some await between we created the service and here, the connection state might have changed
        // and we don't propagate the connection state when we are not loaded.  So we have to set it again here.
        this.connection.setConnectionState(this.componentContext.connectionState);
        return this.channel;
    }
}
