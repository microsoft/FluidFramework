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
	requestId?: string;
}

/**
 * @deprecated
 * No need to return requestId in error response.
 * x-correlation-id in response header should be used for tracking purpose
 * TODO: remove it once no usage from external users
 */
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
	public toJSON(): INetworkErrorDetails & { code: number; requestId: string } {
		return {
			requestId: this.requestId,
			...super.toJSON(),
		};
	}
}

/**
 * Indicate that a connect is rejected/dropped because the token has been revoked.
 */
export class TokenRevokedError extends NetworkError {
	public readonly errorType: string = "TokenRevoked";
	constructor(
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

	public get details(): INetworkErrorDetails & { errorType: string } {
		return {
			message: this.message,
			errorType: this.errorType,
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
	public toJSON(): INetworkErrorDetails & { code: number; errorType: string } {
		return {
			errorType: this.errorType,
			...super.toJSON(),
		};
	}
}

export interface IRevokeTokenOptions {
	correlationId: string;
}

export interface IRevokedTokenChecker {
	// Check if a given token id is revoked
	isTokenRevoked(tenantId: string, documentId: string, jwtId: string): Promise<boolean>;
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
	revokeToken(
		tenantId: string,
		documentId: string,
		jwtId: string,
		options?: IRevokeTokenOptions,
	): Promise<ITokenRevocationResponse>;

	/**
	 * @deprecated move this function to IRevokedTokenChecker
	 */
	isTokenRevoked?(tenantId: string, documentId: string, jwtId: string): Promise<boolean>;
}

export function createCompositeTokenId(
	tenantId: string,
	documentId: string,
	jwtId: string,
): string {
	return `${tenantId}/${documentId}/${jwtId}`;
}
