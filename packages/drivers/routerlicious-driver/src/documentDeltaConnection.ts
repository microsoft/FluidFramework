/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentDeltaConnection } from "@fluidframework/driver-base/internal";
import {
	IDocumentDeltaConnection,
	IAnyDriverError,
} from "@fluidframework/driver-definitions/internal";
import { IClient, IConnect } from "@fluidframework/protocol-definitions";
import { encodeJsonableOrBinary } from "@fluidframework/driver-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import type { io as SocketIOClientStatic } from "socket.io-client";

import { IR11sSocketError, errorObjectFromSocketError } from "./errorUtils.js";
import { pkgVersion as driverVersion } from "./packageVersion.js";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

/**
 * Wrapper over the shared one for driver specific translation.
 */
export class R11sDocumentDeltaConnection extends DocumentDeltaConnection {
	public static async create(
		tenantId: string,
		id: string,
		token: string | null,
		io: typeof SocketIOClientStatic,
		client: IClient,
		url: string,
		logger: ITelemetryLoggerExt,
		timeoutMs = 20000,
		enableLongPollingDowngrade = true,
	): Promise<IDocumentDeltaConnection> {
		const socket = io(url, {
			query: {
				documentId: id,
				tenantId,
			},
			reconnection: false,
			// Default to websocket connection, with long-polling disabled
			transports: ["websocket"],
			timeout: timeoutMs,
		});

		const connectMessage: IConnect = {
			client,
			id,
			mode: client.mode,
			tenantId,
			token, // Token is going to indicate tenant level information, etc...
			versions: protocolVersions,
			relayUserAgent: [client.details.environment, ` driverVersion:${driverVersion}`].join(
				";",
			),
		};

		const deltaConnection = new R11sDocumentDeltaConnection(
			socket,
			id,
			logger,
			enableLongPollingDowngrade,
		);

		await deltaConnection.initialize(connectMessage, timeoutMs);
		return deltaConnection;
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
		super.submitSignal(encodeJsonableOrBinary(content));
	}

	/**
	 * Error raising for socket.io issues
	 */
	protected createErrorObject(handler: string, error?: any, canRetry = true): IAnyDriverError {
		// Note: we suspect the incoming error object is either:
		// - a socketError: add it to the R11sError object for driver to be able to parse it and reason over it.
		// - anything else: let base class handle it
		return canRetry && Number.isInteger(error?.code) && typeof error?.message === "string"
			? errorObjectFromSocketError(error as IR11sSocketError, handler)
			: super.createErrorObject(handler, error, canRetry);
	}
}
