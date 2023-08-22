/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IErrorBase,
	ITelemetryProperties,
	IThrottlingWarning,
} from "@fluidframework/core-interfaces";
import { ContainerErrorTypes } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import {
	IFluidErrorBase,
	isExternalError,
	ITelemetryLoggerExt,
	LoggingError,
	NORMALIZED_ERROR_TYPE,
	normalizeError,
	wrapError,
	wrapErrorAndLog,
} from "@fluidframework/telemetry-utils";

/**
 * Warning emitted when requests to storage are being throttled.
 *
 * @deprecated
 *
 * This type is not intended for external use and is being removed from library exports.
 * No replacement API is intended.
 */
export class ThrottlingWarning extends LoggingError implements IThrottlingWarning, IFluidErrorBase {
	readonly errorType = ContainerErrorTypes.throttlingError;

	private constructor(
		message: string,
		readonly retryAfterSeconds: number,
		props?: ITelemetryProperties,
	) {
		super(message, props);
	}

	/**
	 * Wrap the given error as a ThrottlingWarning
	 * Only preserves the error message, and applies the given retry after to the new warning object
	 */
	static wrap(
		error: unknown,
		retryAfterSeconds: number,
		logger: ITelemetryLoggerExt,
	): IThrottlingWarning {
		const newErrorFn = (errMsg: string) => new ThrottlingWarning(errMsg, retryAfterSeconds);
		return wrapErrorAndLog(error, newErrorFn, logger);
	}
}

/**
 * Error indicating that a client's session has reached its time limit and is closed.
 */
export class ClientSessionExpiredError extends LoggingError implements IFluidErrorBase {
	readonly errorType = ContainerErrorTypes.clientSessionExpiredError;

	constructor(message: string, readonly expiryMs: number) {
		super(message, { timeoutMs: expiryMs });
	}
}

/**
 * DataProcessingError indicates we hit a fatal error while processing incoming data from the Fluid Service.
 * The error will often originate in the dataStore or DDS implementation that is responding to incoming changes.
 * This differs from DataCorruptionError in that this may be a transient error that will not repro in another
 * client or session.
 */
export class DataProcessingError extends LoggingError implements IErrorBase, IFluidErrorBase {
	readonly errorType = ContainerErrorTypes.dataProcessingError;
	readonly canRetry = false;

	private constructor(errorMessage: string) {
		super(errorMessage);
	}

	/** Create a new DataProcessingError detected and raised with the FF code */
	static create(
		errorMessage: string,
		dataProcessingCodepath: string,
		sequencedMessage?: ISequencedDocumentMessage,
		props: ITelemetryProperties = {},
	) {
		const dataProcessingError = DataProcessingError.wrapIfUnrecognized(
			errorMessage,
			dataProcessingCodepath,
			sequencedMessage,
		);
		dataProcessingError.addTelemetryProperties(props);

		return dataProcessingError;
	}

	/**
	 * Wrap the given error in a DataProcessingError, unless the error is already of a known type
	 * with the exception of a normalized LoggingError, which will still be wrapped.
	 * In either case, the error will have some relevant properties added for telemetry
	 * We wrap conditionally since known error types represent well-understood failure modes, and ideally
	 * one day we will move away from throwing these errors but rather we'll return them.
	 * But an unrecognized error needs to be classified as DataProcessingError.
	 * @param originalError - error to be converted
	 * @param dataProcessingCodepath - which codepath failed while processing data
	 * @param messageLike - Sequenced message to include info about via telemetry props
	 * @returns Either a new DataProcessingError, or (if wrapping is deemed unnecessary) the given error
	 */
	static wrapIfUnrecognized(
		originalError: any,
		dataProcessingCodepath: string,
		messageLike?: Partial<
			Pick<
				ISequencedDocumentMessage,
				| "clientId"
				| "sequenceNumber"
				| "clientSequenceNumber"
				| "referenceSequenceNumber"
				| "minimumSequenceNumber"
				| "timestamp"
			>
		>,
	): IFluidErrorBase {
		const props = {
			dataProcessingError: 1,
			dataProcessingCodepath,
			...(messageLike === undefined
				? undefined
				: extractSafePropertiesFromMessage(messageLike)),
		};

		const normalizedError = normalizeError(originalError, { props });
		// Note that other errors may have the NORMALIZED_ERROR_TYPE errorType,
		// but if so they are still suitable to be wrapped as DataProcessingError.
		if (
			isExternalError(normalizedError) ||
			normalizedError.errorType === NORMALIZED_ERROR_TYPE
		) {
			// Create a new DataProcessingError to wrap this external error
			const dataProcessingError = wrapError(
				normalizedError,
				(message: string) => new DataProcessingError(message),
			);

			// Copy over the props above and any others added to this error since first being normalized
			dataProcessingError.addTelemetryProperties(normalizedError.getTelemetryProperties());

			return dataProcessingError;
		}
		return normalizedError;
	}
}

export const extractSafePropertiesFromMessage = (
	messageLike: Partial<
		Pick<
			ISequencedDocumentMessage,
			| "clientId"
			| "sequenceNumber"
			| "clientSequenceNumber"
			| "referenceSequenceNumber"
			| "minimumSequenceNumber"
			| "timestamp"
		>
	>,
) => ({
	messageClientId: messageLike.clientId === null ? "null" : messageLike.clientId,
	messageSequenceNumber: messageLike.sequenceNumber,
	messageClientSequenceNumber: messageLike.clientSequenceNumber,
	messageReferenceSequenceNumber: messageLike.referenceSequenceNumber,
	messageMinimumSequenceNumber: messageLike.minimumSequenceNumber,
	messageTimestamp: messageLike.timestamp,
});
