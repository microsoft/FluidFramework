/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { NetworkError, INetworkErrorDetails } from "@fluidframework/server-services-client";
import { IWebSocket } from "./http";

/**
 * Interface of web socket tracker
 * it tracks the mapping of web socket and token used to establish the socket connection
 */
export interface IWebSocketTracker {
	// Add a socket to internal map
	addSocketForToken(compositeTokenId: string, webSocket: IWebSocket);

	// Get socket objects from internal map
	getSocketsForToken(compositeTokenId: string): IWebSocket[];

	// Remove socket from tracking
	// Return true if socket is removed, false if socket is not found
	removeSocket(socketId: string): boolean;
}

export interface ITokenRevocationResponse {
	requestId: string,
}

export class TokenRevocationError extends NetworkError {
	constructor(
		/**
		 * The request id. Used for tracking the request and later investigation
		 * @public
		 */
		public readonly requestId: string,
		/**
		 * HTTP status code that describes the error.
		 */
		code: number,
		/**
		 * The message associated with the error.
		 */
		message: string,
		/**
		 * Optional boolean indicating whether this is an error that can be retried.
		 * Only relevant when {@link NetworkError.isFatal} is false.
		 */
		canRetry?: boolean,
		/**
		 * Optional boolean indicating whether this error is fatal. This generally indicates that the error causes
		 * negative, non-recoverable impact to the component/caller and cannot be ignored.
		 */
		isFatal?: boolean,
		/**
		 * Optional value representing the time in milliseconds that should be waited before retrying.
		 */
		retryAfterMs?: number,
	) {
		super(code, message, canRetry, isFatal, retryAfterMs);
	}

	public get details(): INetworkErrorDetails & { requestId: string } {	
		return {
			message: this.message,
			requestId: this.requestId,
			canRetry: this.canRetry,
			isFatal: this.isFatal,
			retryAfter: this.retryAfter,
			retryAfterMs: this.retryAfterMs,
		};
	}
	
	/**
	 * Explicitly define how to serialize as JSON so that socket.io can emit relevant info.
	 * @public
	 */
	public toJSON(): INetworkErrorDetails & { code: number, requestId: string } {
		return {
			requestId: this.requestId,
			...(super.toJSON()),
		};
	}
}

/**
 * Interface of Json Web Token(JWT) manager
 * It is mainly used to manage token revocation
 */
export interface ITokenRevocationManager {
	initialize(): Promise<void>;

	start(): Promise<void>;

	/**
	 * Close and clean up resources.
	 */
	close(): Promise<void>;

	// Revoke the access of a token given its jwtId
	revokeToken(tenantId: string, documentId: string, jwtId: string): Promise<ITokenRevocationResponse>;

	// Check if a given token id is revoked
	isTokenRevoked(tenantId: string, documentId: string, jwtId: string): Promise<boolean>;
}

export function createCompositeTokenId(
	tenantId: string,
	documentId: string,
	jwtId: string,
): string {
	return `${tenantId}/${documentId}/${jwtId}`;
}
