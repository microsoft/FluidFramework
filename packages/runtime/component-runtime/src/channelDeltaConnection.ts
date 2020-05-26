/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { IDocumentMessage, ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IDeltaConnection, IDeltaHandler } from "@fluidframework/component-runtime-definitions";

export class ChannelDeltaConnection implements IDeltaConnection {
    private _handler: IDeltaHandler | undefined;

    private get handler(): IDeltaHandler {
        assert(this._handler);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this._handler!;
    }
    public get connected(): boolean {
        return this._connected;
    }

    constructor(
        public objectId: string,
        private _connected: boolean,
        private readonly submitFn: (message: IDocumentMessage) => number,
        private readonly dirtyFn: () => void) {
    }

    public attach(handler: IDeltaHandler) {
        assert(this._handler === undefined);
        this._handler = handler;
    }

    public setConnectionState(connected: boolean) {
        this._connected = connected;
        this.handler.setConnectionState(connected);
    }

    public process(message: ISequencedDocumentMessage, local: boolean) {
        this.handler.process(message, local);
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IDocumentMessage): number {
        return this.submitFn(message);
    }

    /**
     * Indicates that the channel is dirty and needs to be part of the summary. It is called by a SharedSummaryBlock
     * that needs to be part of the summary but does not generate ops.
     */
    public dirty(): void {
        this.dirtyFn();
    }
}
