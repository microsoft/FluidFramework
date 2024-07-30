/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { DocumentDeltaConnection } from "@fluidframework/driver-base/internal";
import {
	IClient,
	IConnect,
	IDocumentMessage,
	NackErrorType,
} from "@fluidframework/protocol-definitions";
import { encodeJsonableOrBinary } from "@fluidframework/driver-utils/internal";
import { LocalWebSocketServer } from "@fluidframework/server-local-server";
import { IWebSocketServer } from "@fluidframework/server-services-core";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";
import type { Socket } from "socket.io-client";

const testProtocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Represents a connection to a stream of delta updates
 * @internal
 */
export class LocalDocumentDeltaConnection extends DocumentDeltaConnection {
	/**
	 * Create a LocalDocumentDeltaConnection
	 * Handle initial messages, contents or signals if they were in queue
	 *
	 * @param tenantId - the ID of the tenant
	 * @param id - document ID
	 * @param token - authorization token for storage service
	 * @param client - information about the client
	 * @param webSocketServer - web socket server to create connection
	 */
	public static async create(
		tenantId: string,
		id: string,
		token: string,
		client: IClient,
		webSocketServer: IWebSocketServer,
		timeoutMs = 60000,
		logger?: ITelemetryBaseLogger,
	): Promise<LocalDocumentDeltaConnection> {
		const socket = (webSocketServer as LocalWebSocketServer).createConnection();

		// Cast LocalWebSocket to SocketIOClient.Socket which is the socket that the base class needs. This is hacky
		// but should be fine because this delta connection is for local use only.
		const socketWithListener = socket as unknown as Socket;

		const deltaConnection = new LocalDocumentDeltaConnection(socketWithListener, id, logger);

		const connectMessage: IConnect = {
			client,
			id,
			mode: client.mode,
			tenantId,
			token, // Token is going to indicate tenant level information, etc...
			versions: testProtocolVersions,
		};
		await deltaConnection.initialize(connectMessage, timeoutMs);
		return deltaConnection;
	}

	constructor(socket: Socket, documentId: string, logger?: ITelemetryBaseLogger) {
		super(socket, documentId, createChildLogger({ logger }));
	}

	/**
	 * Submits a new delta operation to the server
	 */
	public submit(messages: IDocumentMessage[]): void {
		// We use a promise resolve to force a turn break given message processing is sync
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		Promise.resolve().then(() => {
			this.emitMessages("submitOp", [messages]);
		});
	}

	/**
	 * Submits a new signal to the server
	 */
	public submitSignal(content: string): void {
		this.emitMessages("submitSignal", [[content]]);
	}

	public submitSignal2(content: unknown): void {
		// WARNING:
		// This code here is only for demonstration purposes. While driver can do encoding here,
		// it would need to do symmetrical decoding for "signal" event payloads, as well as this.initialSignals
		// From efficiency POV, it does not make sense to implement this method if protocol does not support property
		// binary payloads.
		// There are two ways to accomplish it:
		// 1. Leave it as is at socket.io level - it can transfer mixes (JS + binary) messages just fine. On service side,
		//    likely would need to serialize it into binary blob and pass around binary. Maybe doing encodeJsonableOrBinary
		//    on service side is fine (saves bandwidth as we do not waste +33% overhead of base64 encoding), but this makes
		//    service side less efficient (compared if service does some more efficient binary serialization)
		// 2. Serialize into binary here (in driver), and deserialize back on receiving signals, but service and socket.io
		//    works only with binary payloads. Likely most efficient, as avoids extra serialization - deserialization at
		//    socket.io level.
		// The only reason it works as is - ConnectionManager will do decodeJsonableOrBinary() if it gets a string payload.
		// But this is wrong, as we should not have any assumptions going across layers on what kind of serialization format
		// is used - both serialization / deserialization should happen on one layer! (it's Ok to temporarily break this rule
		//  for staging purpose only)
		this.emitMessages("submitSignal", [[encodeJsonableOrBinary(content)]]);
	}

	/**
	 * Send a "disconnect" message on the socket.
	 * @param disconnectReason - The reason of the disconnection.
	 */
	public disconnectClient(disconnectReason: string) {
		this.socket.emit("disconnect", disconnectReason);
	}

	/**
	 * * Sends a "nack" message on the socket.
	 * @param code - An error code number that represents the error. It will be a valid HTTP error code.
	 * @param type - Type of the Nack.
	 * @param message - A message about the nack for debugging/logging/telemetry purposes.
	 */
	public nackClient(
		code: number = 400,
		type: NackErrorType = NackErrorType.ThrottlingError,
		message: any,
	) {
		const nackMessage = {
			operation: undefined,
			sequenceNumber: -1,
			content: {
				code,
				type,
				message,
			},
		};
		this.socket.emit("nack", "", [nackMessage]);
	}
}
