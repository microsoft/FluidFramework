/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaConnection, IDocumentDeltaConnectionEvents } from "@fluidframework/driver-definitions";
import {
    ConnectionMode,
    IDocumentMessage,
    INack,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalClient,
    ISignalMessage,
    ITokenClaims,
} from "@fluidframework/protocol-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";

// This is coppied from alfred.  Probably should clean this up.
const DefaultServiceConfiguration: IServiceConfiguration = {
    blockSize: 64436,
    maxMessageSize: 16 * 1024,
    summary: {
        idleTime: 5000,
        maxOps: 1000,
        maxTime: 5000 * 12,
        maxAckWaitTime: 600000,
    },
};

/**
 * Mock Document Delta Connection for testing
 */
export class MockDocumentDeltaConnection
    extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
    implements IDocumentDeltaConnection {
    public claims: ITokenClaims = {
        documentId: "documentId",
        scopes: ["doc:read", "doc:write", "summary:write"],
        tenantId: "tenantId",
        user: {
            id: "mockid",
        },
        iat: Math.round(new Date().getTime() / 1000),
        exp: Math.round(new Date().getTime() / 1000) + 60 * 60, // 1 hour expiration
        ver: "1.0",
    };

    public readonly mode: ConnectionMode = "write";
    public readonly existing: boolean = true;
    // eslint-disable-next-line no-null/no-null
    public readonly parentBranch: string | null = null;
    public readonly maxMessageSize: number = 16 * 1024;
    public readonly version: string = "";
    public initialMessages: ISequencedDocumentMessage[] = [];
    public initialSignals: ISignalMessage[] = [];
    public initialClients: ISignalClient[] = [];
    public readonly serviceConfiguration = DefaultServiceConfiguration;

    constructor(
        public readonly clientId: string,
        private readonly submitHandler?: (messages: IDocumentMessage[]) => void,
        private readonly submitSignalHandler?: (message: any) => void,
    ) {
        super();
    }

    public submit(messages: IDocumentMessage[]): void {
        if (this.submitHandler !== undefined) {
            this.submitHandler(messages);
        }
    }

    public submitSignal(message: any): void {
        if (this.submitSignalHandler !== undefined) {
            this.submitSignalHandler(message);
        }
    }
    public close(reason?: string) {
        this.emit("disconnect", reason ?? "mock close() called");
    }

    // Mock methods for raising events
    public emitOp(documentId: string, messages: Partial<ISequencedDocumentMessage>[]) {
        this.emit("op", documentId, messages);
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
