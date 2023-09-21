/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @deprecated
 *
 * Note: this package is scheduled for deletion.
 * Remaining exports are here for backwards compatibility and to notify consumers where to look for replacement APIs.
 * Please do not add any new code or exports to this package.
 *
 * @packageDocumentation
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
