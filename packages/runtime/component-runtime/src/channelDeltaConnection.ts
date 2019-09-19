/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDeltaConnection, IDeltaHandler } from "@microsoft/fluid-runtime-definitions";
import { ConnectionState } from "@microsoft/fluid-container-definitions";
import { IDocumentMessage, ISequencedDocumentMessage } from "@microsoft/fluid-protocol-definitions";
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

    public process(message: ISequencedDocumentMessage, local: boolean) {
        this.handler.process(message, local);
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IDocumentMessage): number {
        return this.submitFn(message);
    }
}
