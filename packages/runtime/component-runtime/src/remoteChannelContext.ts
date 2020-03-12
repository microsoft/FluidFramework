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
    ISummaryTracker,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { createServiceEndpoints, IChannelContext, snapshotChannel } from "./channelContext";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ISharedObjectRegistry } from "./componentRuntime";
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
    constructor(
        private readonly runtime: IComponentRuntime,
        private readonly componentContext: IComponentContext,
        storageService: IDocumentStorageService,
        submitFn: (type: MessageType, content: any) => number,
        private readonly id: string,
        baseSnapshot: ISnapshotTree,
        private readonly registry: ISharedObjectRegistry,
        extraBlobs: Map<string, string>,
        private readonly branch: string,
        private readonly summaryTracker: ISummaryTracker,
        private readonly attachMessageType?: string,
    ) {

        this.services = createServiceEndpoints(
            this.id,
            this.componentContext.connectionState,
            submitFn,
            storageService,
            baseSnapshot,
            extraBlobs);
    }

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

        this.services.deltaConnection.setConnectionState(value);
    }

    public processOp(message: ISequencedDocumentMessage, local: boolean): void {
        this.summaryTracker.updateLatestSequenceNumber(message.sequenceNumber);

        if (this.isLoaded) {
            this.services.deltaConnection.process(message, local);
        } else {
            assert(!local);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending!.push(message);
        }
    }

    public async snapshot(fullTree: boolean = false): Promise<ITree> {
        if (!fullTree) {
            const id = await this.summaryTracker.getId();
            if (id !== undefined) {
                return { id, entries: [] };
            }
        }

        const channel = await this.getChannel();
        return snapshotChannel(channel);
    }


    private async loadChannel(): Promise<IChannel> {
        assert(!this.isLoaded);

        let attributes =  await readAndParse<IChannelAttributes | undefined>(
            this.services.objectStorage,
            ".attributes");

        let factory: ISharedObjectFactory | undefined;
        // this is a back-compat case where
        // the attach message doesn't include
        // the attributes. Since old attach messages
        // will not have attributes we need to keep
        // this as long as we support old attach messages
        if (attributes === undefined){
            if(this.attachMessageType === undefined){
                throw new Error("Channel type not available");
            }
            factory = this.registry.get(this.attachMessageType);
            attributes = factory?.attributes;
        } else {
            factory = this.registry.get(attributes.type);
        }
        if (attributes === undefined) {
            throw new Error(`Channel attributes not available for type: ${this.attachMessageType}`);
        }

        if (factory === undefined) {
            throw new Error(`Channel Factory ${attributes.type} not registered`);
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

        this.channel = await factory.load(
            this.runtime,
            this.id,
            this.services,
            this.branch,
            attributes);

        // Send all pending messages to the channel
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        for (const message of this.pending!) {
            this.services.deltaConnection.process(message, false);
        }
        this.pending = undefined;
        this.isLoaded = true;

        // Because have some await between we created the service and here, the connection state might have changed
        // and we don't propagate the connection state when we are not loaded.  So we have to set it again here.
        this.services.deltaConnection.setConnectionState(this.componentContext.connectionState);
        return this.channel;
    }
}
