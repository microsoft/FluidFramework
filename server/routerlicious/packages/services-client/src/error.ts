/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AxiosError } from "axios";

/**
 * Represents the internal error code in NetworkError
 * @internal
 */
export enum InternalErrorCode {
	/**
	 * The cluster is under draining.
	 */
	ClusterDraining = "ClusterDraining",

	/**
	 * The token has been revoked.
	 */
	TokenRevoked = "TokenRevoked",
}

/**
 * Represents the details associated with a {@link NetworkError}.
 * @internal
 */
export interface INetworkErrorDetails {
	/**
	 * Indicates whether this is an error that can be retried. Refer to {@link NetworkError.canRetry}.
	 */
	canRetry?: boolean;
	/**
	 * Indicates whether this error is fatal. This generally indicates that the error causes
	 * negative, non-recoverable impact to the component/caller and cannot be ignored.
	 * Refer to {@link NetworkError.isFatal}.
	 */
	isFatal?: boolean;
	/**
	 * Represents the message associated with the error. Refer to {@link NetworkError}'s message.
	 */
	message?: string;
	/**
	 * Represents the time in seconds that should be waited before retrying.
	 * TODO: remove in favor of retryAfterMs.
	 * Refer to {@link NetworkError.retryAfter}.
	 */
	retryAfter?: number;
	/**
	 * Represents the time in seconds that should be waited before retrying.
	 * Refer to {@link NetworkError.retryAfterMs}.
	 */
	retryAfterMs?: number;
	/**
	 * Indicates the source where the network error is triggered from. It can contain a message or a stack trace.
	 * Refer to {@link NetworkError.source}.
	 */
	source?: string;
	/**
	 * Represents the internal error code in NetworkError.
	 * Refer to {@link NetworkError.internalErrorCode}.
	 */
	internalErrorCode?: InternalErrorCode;
}

/**
 * Represents errors associated with network communication.
 *
 * @remarks
 * The Fluid Framework server implementation includes a collection of services that communicate with each other
 * over the network. Network communication is subject to a diverse range of errors. {@link NetworkError} helps
 * convey more information than a simple HTTP status code, allowing services to be aware of the context of a
 * network error and making those services more prepared to react to such kinds of errors.
 * @internal
 */
export class NetworkError extends Error {
	/**
	 * Value representing the time in seconds that should be waited before retrying.
	 * TODO: remove in favor of retryAfterMs once driver supports retryAfterMs.
	 */
	public readonly retryAfter?: number;

	constructor(
		/**
		 * HTTP status code that describes the error.
		 * @public
		 */
		public readonly code: number,
		/**
		 * The message associated with the error.
		 * @public
		 */
		message: string,
		/**
		 * Optional boolean indicating whether this is an error that can be retried.
		 * Only relevant when {@link NetworkError.isFatal} is false.
		 * @public
		 */
		public readonly canRetry?: boolean,
		/**
		 * Optional boolean indicating whether this error is fatal. This generally indicates that the error causes
		 * negative, non-recoverable impact to the component/caller and cannot be ignored.
		 * @public
		 */
		public readonly isFatal?: boolean,
		/**
		 * Optional value representing the time in milliseconds that should be waited before retrying.
		 * @public
		 */
		public readonly retryAfterMs?: number,
		/**
		 * Optional value indicating the source where the network error is triggered from. It can contain a message or a stack trace.
		 * @public
		 */
		public readonly source?: string,
		/**
		 * Optional value indicating the internal error code in NetworkError. It can be used
		 * with code to provide more information of an error
		 * @internal
		 */
		public readonly internalErrorCode?: InternalErrorCode,
	) {
		super(message);
		this.name = "NetworkError";
		this.retryAfter = retryAfterMs !== undefined ? retryAfterMs / 1000 : undefined;
	}

	/**
	 * Gets the details associated with this {@link NetworkError}.
	 * @returns A simple string conveying the message if no other details are included in this {@link NetworkError},
	 * or an {@link INetworkErrorDetails} object otherwise.
	 */
	public get details(): INetworkErrorDetails | string {
		if (
			this.canRetry === undefined &&
			this.isFatal === undefined &&
			this.retryAfterMs === undefined &&
			this.source === undefined &&
			this.internalErrorCode === undefined
		) {
			return this.message;
		}

		return {
			message: this.message,
			canRetry: this.canRetry,
			isFatal: this.isFatal,
			retryAfter: this.retryAfter,
			retryAfterMs: this.retryAfterMs,
			source: this.source,
			internalErrorCode: this.internalErrorCode,
		};
	}

	/**
	 * Explicitly define how to serialize as JSON so that socket.io can emit relevant info.
	 */
	public toJSON(): INetworkErrorDetails & { code: number } {
		return {
			code: this.code,
			message: this.message,
			canRetry: this.canRetry,
			isFatal: this.isFatal,
			retryAfterMs: this.retryAfterMs,
			retryAfter: this.retryAfter,
			source: this.source,
			internalErrorCode: this.internalErrorCode,
		};
	}
}

/**
 * @internal
 */
export function isNetworkError(error: unknown): error is NetworkError {
	return (
		(error as NetworkError).name === "NetworkError" &&
		typeof (error as NetworkError).code === "number" &&
		typeof (error as NetworkError).message === "string"
	);
}

/**
 * Convenience function for generating a {@link NetworkError}.
 * @remarks Generates a {@link NetworkError} instance appropriately configured given the status code and error data
 * provided. This function is intended to be used in situations where a {@link NetworkError} is dynamically created
 * based variable parameters. That is, when it is not known whether the status code can be 404 or 500.
 * @param statusCode - HTTP status code that describes the error.
 * @param errorData - Optional additional data associated with the error. Can either be a simple string representing
 * the message, or an {@link INetworkErrorDetails} object.
 * @returns A {@link NetworkError} instance properly configured according to the parameters provided.
 * @internal
 */
export function createFluidServiceNetworkError(
	statusCode: number,
	errorData?: INetworkErrorDetails | string,
): NetworkError {
	let message: string;
	let canRetry: boolean | undefined;
	let isFatal: boolean | undefined;
	let retryAfter: number | undefined;
	let source: string | undefined;
	let internalErrorCode: InternalErrorCode | undefined;

	if (errorData && typeof errorData === "object") {
		message = errorData.message ?? "Unknown Error";
		canRetry = errorData.canRetry;
		isFatal = errorData.isFatal;
		retryAfter = errorData.retryAfterMs ?? errorData.retryAfter;
		source = errorData.source;
		internalErrorCode = errorData.internalErrorCode;
	} else if (errorData && typeof errorData === "string") {
		message = errorData;
	} else {
		message = "Unknown Error";
	}

	switch (statusCode) {
		case 401:
		case 403:
		case 404:
			return new NetworkError(
				statusCode,
				message,
				false /* canRetry */,
				false /* isFatal */,
				undefined /* retryAfterMs */,
				source,
				internalErrorCode,
			);
		case 413:
		case 422:
			return new NetworkError(
				statusCode,
				message,
				canRetry ?? false /* canRetry */,
				isFatal ?? false /* isFatal */,
				canRetry ? retryAfter : undefined,
				source,
				internalErrorCode,
			);
		case 429:
			return new NetworkError(
				statusCode,
				message,
				true /* canRetry */,
				false /* isFatal */,
				retryAfter,
				source,
				internalErrorCode,
			);
		case 500: {
			return new NetworkError(
				statusCode,
				message,
				canRetry ?? true /* canRetry */,
				isFatal ?? false /* isFatal */,
				canRetry ? retryAfter : undefined,
				source,
				internalErrorCode,
			);
		}
		case 502:
		case 503:
		case 504:
			return new NetworkError(
				statusCode,
				message,
				true /* canRetry */,
				false /* isFatal */,
				retryAfter,
				source,
				internalErrorCode,
			);
		default:
			return new NetworkError(
				statusCode,
				message,
				false /* canRetry */,
				true /* isFatal */,
				undefined /* retryAfterMs */,
				source,
				internalErrorCode,
			);
	}
}

/**
 * Convenience function to both generate and throw a {@link NetworkError}.
 * @remarks Similarly to {@link createFluidServiceNetworkError}, this function generates a {@link NetworkError}
 * instance appropriately configured given the status code and error data provided. The difference is that this
 * function also throws the {@link NetworkError}.
 * @param statusCode - HTTP status code that describes the error.
 * @param errorData - Optional additional data associated with the error. Can either be a simple string representing
 * the message, or an {@link INetworkErrorDetails} object.
 * @internal
 */
export function throwFluidServiceNetworkError(
	statusCode: number,
	errorData?: INetworkErrorDetails | string,
): never {
	const networkError = createFluidServiceNetworkError(statusCode, errorData);
	throw networkError;
}

/**
 * @internal
 */
export function convertAxiosErrorToNetorkError(error: AxiosError) {
	const { response, request } = error ?? {};
	if (response === undefined) {
		if (request !== undefined) {
			// Request was made but no response was received.
			return new NetworkError(
				502,
				`Network Error: ${error?.message ?? "No response received."}`,
			);
		}
	}
	if (response !== undefined) {
		// response.data can have potential sensitive information, so we do not return that.
		return new NetworkError(response.status, response.statusText);
	}
	return new NetworkError(500, "Unknown error.");
}
