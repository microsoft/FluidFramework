/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaConnection, IDeltaHandler } from "@fluidframework/datastore-definitions";
import { CreateProcessingError } from "@fluidframework/container-utils";

export class ChannelDeltaConnection implements IDeltaConnection {
    private _handler: IDeltaHandler | undefined;

    private get handler(): IDeltaHandler {
        assert(!!this._handler, 0x177 /* "Missing delta handler" */);
        return this._handler;
    }
    public get connected(): boolean {
        return this._connected;
    }

    constructor(
        public objectId: string,
        private _connected: boolean,
        private readonly submitFn: (message: IDocumentMessage, localOpMetadata: unknown) => void,
        private readonly dirtyFn: () => void) {
    }

    public attach(handler: IDeltaHandler) {
        assert(this._handler === undefined, 0x178 /* "Missing delta handler on attach" */);
        this._handler = handler;
    }

    public setConnectionState(connected: boolean) {
        this._connected = connected;
        this.handler.setConnectionState(connected);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        try {
            // catches as data processing error whether or not they come from async pending queues
            this.handler.process(message, local, localOpMetadata);
        } catch (error) {
            // eslint-disable-next-line @typescript-eslint/no-throw-literal
            throw CreateProcessingError(error, "channelDeltaConnectionFailedToProcessMessage", message);
        }
    }

    public resubmit(content: any, localOpMetadata: unknown) {
        this.handler.resubmit(content, localOpMetadata);
    }

    public applyStashedOp(message: ISequencedDocumentMessage): unknown {
        return this.handler.applyStashedOp(message);
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IDocumentMessage, localOpMetadata: unknown): void {
        this.submitFn(message, localOpMetadata);
    }

    /**
     * Indicates that the channel is dirty and needs to be part of the summary. It is called by a SharedSummaryBlock
     * that needs to be part of the summary but does not generate ops.
     */
    public dirty(): void {
        this.dirtyFn();
    }
}
