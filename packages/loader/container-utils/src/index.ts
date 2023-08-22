/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { DeltaManagerProxyBase } from "./deltaManagerProxyBase";
export { ClientSessionExpiredError, ThrottlingWarning } from "./error";

// Deprecated exports for backwards compatibility
export {
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	DataCorruptionError,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	DataProcessingError,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	extractSafePropertiesFromMessage,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	GenericError,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	UsageError,
} from "@fluidframework/telemetry-utils";
