/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidErrorTypes } from "@fluidframework/core-interfaces/internal";

import type { IResolvedUrl } from "./urlResolver.js";

// Omit `dataCorruptionError` and `dataProcessingError` from the list of values inherited from FluidErrorTypes
const { dataCorruptionError, dataProcessingError, ...FluidErrorTypesExceptDataTypes } =
	FluidErrorTypes;

/**
 * Different error types the Driver may report out to the Host.
 * @legacy
 * @alpha
 */
export const DriverErrorTypes = {
	// Inherit base error types
	...FluidErrorTypesExceptDataTypes,

	/**
	 * Some non-categorized (below) networking error
	 * Include errors like  fatal server error (usually 500).
	 */
	genericNetworkError: "genericNetworkError",

	/**
	 * Access denied - user does not have enough privileges to open a file, or continue to operate on a file
	 */
	authorizationError: "authorizationError",

	/**
	 * File not found, or file deleted during session
	 */
	fileNotFoundOrAccessDeniedError: "fileNotFoundOrAccessDeniedError",

	/**
	 * We can not reach server due to computer being offline.
	 */
	offlineError: "offlineError",

	/*
	 * Unsupported client protocol
	 */
	unsupportedClientProtocolVersion: "unsupportedClientProtocolVersion",

	/**
	 * User does not have write permissions to a file, but is changing content of a file.
	 * That might be indication of some data store error - data stores should not generate ops in readonly mode.
	 */
	writeError: "writeError",

	/**
	 * A generic fetch failure that indicates we were not able to get a response from the server.
	 * This may be due to the client being offline (though, if we are able to detect offline state it will be
	 * logged as an offlineError instead).  Other possibilities could be DNS errors, malformed fetch request,
	 * CSP violation, etc.
	 */
	fetchFailure: "fetchFailure",

	/**
	 * This error occurs when token provider fails to fetch orderer token
	 */
	fetchTokenError: "fetchTokenError",

	/**
	 * Unexpected response from server. Either JSON is malformed, or some required properties are missing
	 */
	incorrectServerResponse: "incorrectServerResponse",

	/**
	 * This error occurs when the file is modified externally (not through Fluid protocol) in storage.
	 * It will occur in cases where client has some state or cache that is based on old content (identity) of a file,
	 * and storage / driver / loader detects such mismatch.
	 * When it's hit, client needs to forget all the knowledge about this file and start over.
	 */
	fileOverwrittenInStorage: "fileOverwrittenInStorage",

	/**
	 * The document is read-only and delta stream connection is forbidden.
	 */
	deltaStreamConnectionForbidden: "deltaStreamConnectionForbidden",

	/**
	 * The location of file/container can change on server. So if the file location moves and we try to access the old
	 * location, then this error is thrown to let the client know about the new location info.
	 */
	locationRedirection: "locationRedirection",

	/**
	 * When a file is not a Fluid file, but has Fluid extension such as ".note",
	 * server won't be able to open it and will return this error. The innerMostErrorCode will be
	 * "fluidInvalidSchema"
	 */
	fluidInvalidSchema: "fluidInvalidSchema",

	/**
	 * File is locked for read/write by storage, e.g. whole collection is locked and access denied.
	 */
	fileIsLocked: "fileIsLocked",

	/**
	 * Storage is out of space
	 */
	outOfStorageError: "outOfStorageError",
} as const;
/**
 * {@inheritDoc (DriverErrorTypes:variable)}
 * @legacy
 * @alpha
 */
export type DriverErrorTypes = (typeof DriverErrorTypes)[keyof typeof DriverErrorTypes];

/**
 * Checks if the provided message is one of the defined driver error types
 *
 * @param message - The error message to check
 * @returns A boolean indicating if the message is a valid DriverErrorType
 * @legacy
 * @alpha
 */
export function isDriverErrorType(message?: string): message is DriverErrorTypes {
	if (message === undefined) return false;

	// Check if the message matches any value in the DriverErrorTypes object
	return Object.values(DriverErrorTypes).includes(message as DriverErrorTypes);
}

/**
 * Interface describing errors and warnings raised by any driver code.
 *
 * @remarks
 * Not expected to be implemented by a class or an object literal, but rather used in place of
 * any or unknown in various function signatures that pass errors around.
 *
 * "Any" in the interface name is a nod to the fact that errorType has lost its type constraint.
 * It will be either {@link @fluidframework/driver-definitions#(DriverErrorTypes:variable)} or the specific driver's specialized error type enum,
 * but we can't reference a specific driver's error type enum in this code.
 * @legacy
 * @alpha
 */
export interface IAnyDriverError extends Omit<IDriverErrorBase, "errorType"> {
	readonly errorType: string;
	/**
	 * This property is used predominantly for socket io errors. It captures the underlying socket event name which resulted in the error.
	 * i.e. connect_error, connect_document_error etc.
	 */
	scenarioName?: string;
}

/**
 * Base interface for all errors and warnings
 * @legacy
 * @alpha
 */
export interface IDriverErrorBase {
	/**
	 * Classification of what type of error this is, used programmatically by consumers to interpret the error.
	 *
	 * @privateRemarks TODO: use {@link DriverErrorTypes} instead (breaking change).
	 */
	readonly errorType: DriverErrorTypes;

	/**
	 * Free-form error message
	 */
	readonly message: string;

	/**
	 * True indicates the caller may retry the failed action. False indicates it's a fatal error
	 */
	canRetry: boolean;

	/**
	 * Best guess as to network conditions (online/offline) when the error arose.
	 * See OnlineStatus enum in driver-utils package for expected values.
	 */
	online?: string;

	/**
	 * Whether service was reachable and we got some response from service.
	 */
	endpointReached?: boolean;
}

/**
 * @legacy
 * @alpha
 */
export interface IThrottlingWarning extends IDriverErrorBase {
	readonly errorType: typeof DriverErrorTypes.throttlingError;
	readonly retryAfterSeconds: number;
}

/**
 * @legacy
 * @alpha
 */
export interface IGenericNetworkError extends IDriverErrorBase {
	readonly errorType: typeof DriverErrorTypes.genericNetworkError;
	readonly statusCode?: number;
}

/**
 * @legacy
 * @alpha
 */
export interface IAuthorizationError extends IDriverErrorBase {
	readonly errorType: typeof DriverErrorTypes.authorizationError;
	readonly claims?: string;
	readonly tenantId?: string;
}

/**
 * @legacy
 * @alpha
 */
export interface ILocationRedirectionError extends IDriverErrorBase {
	readonly errorType: typeof DriverErrorTypes.locationRedirection;
	readonly redirectUrl: IResolvedUrl;
}

/**
 * Having this uber interface without types that have their own interfaces
 * allows compiler to differentiate interfaces based on error type
 * @legacy
 * @alpha
 */
export interface IDriverBasicError extends IDriverErrorBase {
	readonly errorType:
		| typeof DriverErrorTypes.genericError
		| typeof DriverErrorTypes.fileNotFoundOrAccessDeniedError
		| typeof DriverErrorTypes.offlineError
		| typeof DriverErrorTypes.unsupportedClientProtocolVersion
		| typeof DriverErrorTypes.writeError
		| typeof DriverErrorTypes.fetchFailure
		| typeof DriverErrorTypes.fetchTokenError
		| typeof DriverErrorTypes.incorrectServerResponse
		| typeof DriverErrorTypes.fileOverwrittenInStorage
		| typeof DriverErrorTypes.fluidInvalidSchema
		| typeof DriverErrorTypes.usageError
		| typeof DriverErrorTypes.fileIsLocked
		| typeof DriverErrorTypes.outOfStorageError;
	readonly statusCode?: number;
}

/**
 * @legacy
 * @alpha
 */
export type DriverError =
	| IThrottlingWarning
	| IGenericNetworkError
	| IAuthorizationError
	| ILocationRedirectionError
	| IDriverBasicError;
