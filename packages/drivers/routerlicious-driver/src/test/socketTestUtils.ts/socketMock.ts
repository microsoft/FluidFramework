/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IEvent } from "@fluidframework/core-interfaces";
import {
	IAnyDriverError,
	IConnect,
	IConnected,
	ScopeType,
} from "@fluidframework/driver-definitions/internal";
import { createGenericNetworkError } from "@fluidframework/driver-utils/internal";
import { v4 as uuid } from "uuid";

import { pkgVersion as driverVersion } from "../../packageVersion.js";

export interface SocketMockEvents extends IEvent {
	(event: "disconnect", listener: (reason?: IAnyDriverError, details?: unknown) => void): void;
	(event: "error", listener: (error?: IAnyDriverError) => void): void;
}

export interface IMockSocketConnectResponse {
	connect_document:
		| {
				eventToEmit: "connect_document_success";
				connectMessage?: IConnected;
		  }
		| {
				eventToEmit: "connect_document_error";
				errorToThrow?: IAnyDriverError;
		  }
		| {
				eventToEmit: "connect_error";
				errorToThrow?: IAnyDriverError;
		  }
		| {
				eventToEmit: "connect_timeout";
		  };
}

/**
 * Class to mock the client socket connection. It can intercepts the events made on the socket
 * and then do its custom logic and can also send events to the client back.
 * @internal
 */
export class ClientSocketMock extends TypedEventEmitter<SocketMockEvents> {
	public disconnected = false;
	constructor(
		private readonly mockSocketConnectResponse: IMockSocketConnectResponse = {
			connect_document: { eventToEmit: "connect_document_success" },
		},
	) {
		super();
	}

	public get connected(): boolean {
		return !this.disconnected;
	}

	public close(): void {
		this.disconnect();
	}

	public disconnect(): void {
		this.disconnected = true;
	}

	public get io(): {
		reconnection: () => boolean;
		reconnectionAttempts: () => number;
	} {
		return {
			reconnection: () => false,
			reconnectionAttempts: () => 0,
		};
	}

	public sendDisconnectEvent(
		reason?: IAnyDriverError,
		details?: { context: { type?: string; code?: number } },
	): void {
		const error =
			reason ?? createGenericNetworkError("TestError", { canRetry: false }, { driverVersion });
		this.emit("disconnect", error, details);
	}

	public sendErrorEvent(error?: IAnyDriverError): void {
		this.emit(
			"error",
			error ?? createGenericNetworkError("TestError", { canRetry: false }, { driverVersion }),
		);
	}

	public emit(eventName: string, ...args: unknown[]): boolean {
		switch (eventName) {
			case "connect_document": {
				const connectMessage = args[0] as IConnect;
				switch (this.mockSocketConnectResponse.connect_document.eventToEmit) {
					case "connect_document_error":
					case "connect_error": {
						const errorToThrow =
							this.mockSocketConnectResponse.connect_document.errorToThrow ??
							createGenericNetworkError("TestError", { canRetry: false }, { driverVersion });
						this.emit(
							this.mockSocketConnectResponse.connect_document.eventToEmit,
							errorToThrow,
						);
						break;
					}
					case "connect_document_success": {
						const iConnected: IConnected = this.mockSocketConnectResponse.connect_document
							.connectMessage ?? {
							clientId: uuid(),
							existing: true,
							initialClients: [],
							initialMessages: [],
							initialSignals: [],
							maxMessageSize: 1000,
							mode: connectMessage.mode,
							version: connectMessage.versions[0]!,
							serviceConfiguration: { maxMessageSize: 1000, blockSize: 1000 },
							claims: {
								documentId: connectMessage.id,
								scopes: [ScopeType.DocWrite, ScopeType.DocRead, ScopeType.SummaryWrite],
								tenantId: connectMessage.tenantId,
								ver: "1.0.0",
								iat: 10,
								exp: 10,
								user: connectMessage.client.user,
							},
							supportedVersions: connectMessage.versions,
							epoch: "testEpoch",
						};
						this.emit("connect_document_success", iConnected);
						break;
					}
					case "connect_timeout": {
						this.emit("connect_timeout");
						break;
					}
					default: // No-op
				}
				return true;
			}
			default: {
				super.emit(eventName, ...args);
				return true;
			}
		}
	}
}
