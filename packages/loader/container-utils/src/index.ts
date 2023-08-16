/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { DeltaManagerProxyBase } from "./deltaManagerProxyBase";
export { DataProcessingError, extractSafePropertiesFromMessage } from "./error";

// Deprecated exports for backwards compatibility
export {
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	ClientSessionExpiredError,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	DataCorruptionError,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	GenericError,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	ThrottlingWarning,
	/**
	 * @deprecated Import from `@fluidframework/telemetry-utils` instead.
	 */
	UsageError,
} from "@fluidframework/telemetry-utils";
