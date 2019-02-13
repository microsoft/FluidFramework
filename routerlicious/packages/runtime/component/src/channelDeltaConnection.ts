import { ConnectionState, IDocumentMessage, ISequencedDocumentMessage } from "@prague/container-definitions";
import {
    IDeltaConnection,
    IDeltaHandler,
} from "@prague/runtime-definitions";
import * as assert from "assert";

export class ChannelDeltaConnection implements IDeltaConnection {
    private handler: IDeltaHandler;

    public get state(): ConnectionState {
        return this._state;
    }

    constructor(
        public objectId: string,
        // tslint:disable-next-line:variable-name
        private _state: ConnectionState,
        private submitFn: (message: IDocumentMessage) => void) {
    }

    public attach(handler: IDeltaHandler) {
        /* tslint:disable:strict-boolean-expressions */
        assert(!this.handler);
        this.handler = handler;
    }

    public setConnectionState(state: ConnectionState) {
        this._state = state;
        this.handler.setConnectionState(state);
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        assert(this.handler);
        return this.handler.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        assert(this.handler);
        this.handler.process(message, local, context);
    }

    public updateMinSequenceNumber(value: number) {
        assert(this.handler);
        this.handler.minSequenceNumberChanged(value);
    }

    /**
     * Send new messages to the server
     */
    public submit(message: IDocumentMessage): void {
        this.submitFn(message);
    }
}
