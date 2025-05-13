/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IDisposable } from "@fluidframework/core-interfaces";
import { ConnectionMode } from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IAnyDriverError,
	IClientConfiguration,
	IDocumentMessage,
	INack,
	ISignalClient,
	ITokenClaims,
	ISequencedDocumentMessage,
	ISignalMessage,
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
		iat: Math.round(Date.now() / 1000),
		exp: Math.round(Date.now() / 1000) + 60 * 60, // 1 hour expiration
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
		private readonly submitSignalHandler?: (message: unknown) => void,
	) {
		super();
	}

	public submit(messages: IDocumentMessage[]): void {
		if (this.submitHandler !== undefined) {
			this.submitHandler(messages);
		}
	}

	public submitSignal(message: unknown): void {
		if (this.submitSignalHandler !== undefined) {
			this.submitSignalHandler(message);
		}
	}
	private _disposed = false;
	public get disposed(): boolean {
		return this._disposed;
	}
	public dispose(error?: Error): void {
		this._disposed = true;
		this.emit("disconnect", error?.message ?? "mock close() called");
	}

	// Mock methods for raising events
	public emitOp(documentId: string, messages: Partial<ISequencedDocumentMessage>[]): void {
		this.emit("op", documentId, messages);
	}
	public emitSignal(signal: Partial<ISignalMessage>): void {
		this.emit("signal", signal);
	}
	public emitNack(documentId: string, message: Partial<INack>[]): void {
		this.emit("nack", documentId, message);
	}
	public emitPong(latency: number): void {
		this.emit("pong", latency);
	}
	public emitDisconnect(disconnectReason: IAnyDriverError): void {
		this.emit("error", disconnectReason);
	}
	public emitError(error: IAnyDriverError): void {
		this.emit("error", error);
	}
}
