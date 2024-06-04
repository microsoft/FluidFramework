/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IDisposable } from "@fluidframework/core-interfaces";
import {
	ConnectionMode,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IAnyDriverError,
	IClientConfiguration,
	IDocumentMessage,
	INack,
	ISignalClient,
	ITokenClaims,
} from "@fluidframework/driver-definitions/internal";

// This is coppied from alfred.  Probably should clean this up.
const DefaultServiceConfiguration: IClientConfiguration = {
	blockSize: 64436,
	maxMessageSize: 16 * 1024,
};

/**
 * Mock Document Delta Connection for testing.
 *
 * @internal
 */
export class MockDocumentDeltaConnection
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
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

	public mode: ConnectionMode = "write";
	public readonly existing: boolean = true;
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
	private _disposed = false;
	public get disposed() {
		return this._disposed;
	}
	public dispose(error?: Error) {
		this._disposed = true;
		this.emit("disconnect", error?.message ?? "mock close() called");
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
	public emitDisconnect(disconnectReason: IAnyDriverError) {
		this.emit("error", disconnectReason);
	}
	public emitError(error: IAnyDriverError) {
		this.emit("error", error);
	}
}
