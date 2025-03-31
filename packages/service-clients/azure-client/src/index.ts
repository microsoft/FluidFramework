/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A simple and powerful way to consume collaborative Fluid data with the Azure Fluid Relay.
 *
 * @packageDocumentation
 */

export { AzureClient } from "./AzureClient.js";
export type {
	AzureClientProps,
	AzureConnectionConfig,
	AzureConnectionConfigType,
	AzureContainerServices,
	AzureContainerVersion,
	AzureGetVersionsOptions,
	AzureLocalConnectionConfig,
	AzureMember,
	AzureRemoteConnectionConfig,
	AzureUser,
	IAzureAudience,
} from "./interfaces.js";

export type { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
export type { IUser } from "@fluidframework/driver-definitions";
import {
	type ITokenClaims as ITokenClaimsBase,
	ScopeType as ScopeTypeBase,
} from "@fluidframework/driver-definitions/internal";

/**
 * {@inheritdoc @fluidframework/driver-definitions/legacy#ITokenClaims}
 * @legacy
 * @alpha
 * @deprecated Consider importing from `@fluidframework/driver-definitions/legacy` - to be removed in 2.40
 */
export type ITokenClaims = ITokenClaimsBase;

/**
 * {@inheritdoc @fluidframework/driver-definitions/legacy#ScopeType}
 * @legacy
 * @alpha
 * @deprecated Use ScopeType from \@fluidframework/driver-definitions/legacy - to be removed in 2.40
 */
export const ScopeType = ScopeTypeBase;
/**
 * {@inheritdoc @fluidframework/driver-definitions/legacy#ScopeType}
 * @legacy
 * @alpha
 * @deprecated Use ScopeType from \@fluidframework/driver-definitions/legacy - to be removed in 2.40
 */
export type ScopeType = ScopeTypeBase;

// Re-export so developers can build loggers without pulling in core-interfaces
export type {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";

// Re-export so developers have access to parameter types for createContainer/getContainer without pulling in fluid-static
export type { CompatibilityMode } from "@fluidframework/fluid-static";
