/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaConnection } from "@microsoft/fluid-driver-definitions";
import {
    ConnectionMode,
    IContentMessage,
    IDocumentMessage,
    INack,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    ITokenClaims,
} from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";

/**
 * Mock Document Delta Connection for testing
 */
export class MockDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    public claims: ITokenClaims;
    public mode: ConnectionMode;
    public existing: boolean;
    public parentBranch: string;
    public maxMessageSize: number;
    public version: string;
    public initialMessages?: ISequencedDocumentMessage[];
    public initialContents?: IContentMessage[];
    public initialSignals?: ISignalMessage[];
    public serviceConfiguration: IServiceConfiguration;

    constructor(
        public readonly clientId: string,
        private readonly submitHandler?: (messages: IDocumentMessage[]) => void,
        private readonly submitSignalHandler?: (message: any) => void,
    ) {
        super();
    }

    public submit(messages: IDocumentMessage[]): void {
        if (this.submitHandler) {
            this.submitHandler(messages);
        }
    }
    public async submitAsync(message: IDocumentMessage[]): Promise<void> {
        this.submit(message);
    }
    public submitSignal(message: any): void {
        if (this.submitSignalHandler) {
            this.submitSignalHandler(message);
        }
    }
    public disconnect(reason?: string) {
        this.emit("disconnect", reason || "mock disconnect called");
    }

    // mock methods for raising events
    public emitOp(documentId: string, messages: Partial<ISequencedDocumentMessage>[]) {
        this.emit("op", documentId, messages);
    }
    public emitOpContent(message: Partial<IContentMessage>) {
        this.emit("op-content", message);
    }
    public emitSignal(signal: Partial<ISignalMessage>) {
        this.emit("signal", signal);
    }
    public emitNack(documentId: string, message: Partial<INack>[]) {
        this.emit("nack", documentId, message);
    }
    public emitPong(latency: number) {
        this.emit("pong", latency);
    }
    public emitError(error: any) {
        this.emit("error", error);
    }
}
