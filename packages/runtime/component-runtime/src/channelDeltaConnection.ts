/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@prague/container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@prague/protocol-definitions";
import {
    IDeltaConnection,
    IDeltaHandler,
} from "@prague/runtime-definitions";
import * as assert from "assert";

export class ChannelDeltaConnection implements IDeltaConnection {
    private _handler: IDeltaHandler | undefined;

    private get handler(): IDeltaHandler {
        assert(this._handler);
        // tslint:disable-next-line: no-non-null-assertion
        return this._handler!;
    }
    public get state(): ConnectionState {
        return this._state;
    }

    constructor(
        public objectId: string,
        private _state: ConnectionState,
        private readonly submitFn: (message: IDocumentMessage) => number) {
    }

    public attach(handler: IDeltaHandler) {
        assert(!this._handler);
        this._handler = handler;
    }

    public setConnectionState(state: ConnectionState) {
        this._state = state;
        this.handler.setConnectionState(state);
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return this.handler.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.handler.process(message, local, context);
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IDocumentMessage): number {
        return this.submitFn(message);
    }
}
