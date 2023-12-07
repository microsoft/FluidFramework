/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FluidErrorTypes,
	IGenericError,
	IErrorBase,
	ITelemetryBaseProperties,
	IUsageError,
} from "@fluidframework/core-interfaces";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import {
	LoggingError,
	NORMALIZED_ERROR_TYPE,
	isExternalError,
	normalizeError,
	wrapError,
} from "./errorLogging";
import { IFluidErrorBase } from "./fluidErrorBase";

/**
 * Throws a UsageError with the given message if the condition is not met.
 * Use this API when `false` indicates a precondition is not met on a public API (for any FF layer).
 *
 * @param condition - The condition that should be true, if the condition is false a UsageError will be thrown.
 * @param message - The message to include in the error when the condition does not hold.
 * @param props - Telemetry props to include on the error when the condition does not hold.
 * @internal
 */
export function validatePrecondition(
	condition: boolean,
	message: string,
	props?: ITelemetryBaseProperties,
): asserts condition {
	if (!condition) {
		throw new UsageError(message, props);
	}
}

/**
 * Generic wrapper for an unrecognized/uncategorized error object
 *
 * @internal
 */
export class GenericError extends LoggingError implements IGenericError, IFluidErrorBase {
	readonly errorType = FluidErrorTypes.genericError;

	/**
	 * Create a new GenericError
	 * @param message - Error message
	 * @param error - inner error object
	 * @param props - Telemetry props to include when the error is logged
	 */
	constructor(
		message: string,
		// TODO: Use `unknown` instead (API breaking change because error is not just an input parameter, but a public member of the class)
		// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
		public readonly error?: any,
		props?: ITelemetryBaseProperties,
	) {
		// Don't try to log the inner error
		super(message, props, new Set(["error"]));
	}
}

/**
 * Error indicating an API is being used improperly resulting in an invalid operation.
 *
 * @internal
 */
export class UsageError extends LoggingError implements IUsageError, IFluidErrorBase {
	readonly errorType = FluidErrorTypes.usageError;

	constructor(message: string, props?: ITelemetryBaseProperties) {
		super(message, { ...props, usageError: true });
	}
}

/**
 * DataCorruptionError indicates that we encountered definitive evidence that the data at rest
 * backing this container is corrupted, and this container would never be expected to load properly again
 *
 * @internal
 */
export class DataCorruptionError extends LoggingError implements IErrorBase, IFluidErrorBase {
	readonly errorType = FluidErrorTypes.dataCorruptionError;
	readonly canRetry = false;

	constructor(message: string, props: ITelemetryBaseProperties) {
		super(message, { ...props, dataProcessingError: 1 });
	}
}

/**
 * Indicates we hit a fatal error while processing incoming data from the Fluid Service.
 *
 * @remarks
 *
 * The error will often originate in the dataStore or DDS implementation that is responding to incoming changes.
 * This differs from {@link DataCorruptionError} in that this may be a transient error that will not repro in another
 * client or session.
 *
 * @internal
 */
export class DataProcessingError extends LoggingError implements IErrorBase, IFluidErrorBase {
	/**
	 * {@inheritDoc IFluidErrorBase.errorType}
	 */
	public readonly errorType = FluidErrorTypes.dataProcessingError;

	public readonly canRetry = false;

	private constructor(errorMessage: string, props?: ITelemetryBaseProperties) {
		super(errorMessage, props);
	}

	/**
	 * Create a new `DataProcessingError` detected and raised within the Fluid Framework.
	 */
	public static create(
		errorMessage: string,
		dataProcessingCodepath: string,
		sequencedMessage?: ISequencedDocumentMessage,
		props: ITelemetryBaseProperties = {},
	): IFluidErrorBase {
		const dataProcessingError = DataProcessingError.wrapIfUnrecognized(
			errorMessage,
			dataProcessingCodepath,
			sequencedMessage,
		);
		dataProcessingError.addTelemetryProperties(props);

		return dataProcessingError;
	}

	/**
	 * Wrap the given error in a `DataProcessingError`, unless the error is already of a known type
	 * with the exception of a normalized {@link LoggingError}, which will still be wrapped.
	 *
	 * In either case, the error will have some relevant properties added for telemetry.
	 *
	 * @remarks
	 *
	 * We wrap conditionally since known error types represent well-understood failure modes, and ideally
	 * one day we will move away from throwing these errors but rather we'll return them.
	 * But an unrecognized error needs to be classified as `DataProcessingError`.
	 *
	 * @param originalError - The error to be converted.
	 * @param dataProcessingCodepath - Which code-path failed while processing data.
	 * @param messageLike - Message to include info about via telemetry props.
	 *
	 * @returns Either a new `DataProcessingError`, or (if wrapping is deemed unnecessary) the given error.
	 */
	public static wrapIfUnrecognized(
		originalError: unknown,
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

/**
 * Extracts specific properties from the provided message that we know are safe to log.
 *
 * @param messageLike - Message to include info about via telemetry props.
 *
 * @internal
 */
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
): {
	messageClientId: string | undefined;
	messageSequenceNumber: number | undefined;
	messageClientSequenceNumber: number | undefined;
	messageReferenceSequenceNumber: number | undefined;
	messageMinimumSequenceNumber: number | undefined;
	messageTimestamp: number | undefined;
} => ({
	messageClientId: messageLike.clientId === null ? "null" : messageLike.clientId,
	messageSequenceNumber: messageLike.sequenceNumber,
	messageClientSequenceNumber: messageLike.clientSequenceNumber,
	messageReferenceSequenceNumber: messageLike.referenceSequenceNumber,
	messageMinimumSequenceNumber: messageLike.minimumSequenceNumber,
	messageTimestamp: messageLike.timestamp,
});
