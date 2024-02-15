/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IResolvedUrl } from "@fluidframework/driver-definitions";

/**
 * Routerlicious extends the resolved url with additional properties to control Routerlicious-specific behaviors.
 * @alpha
 */
export interface IRouterliciousResolvedUrl extends IResolvedUrl {
	/**
	 * A flag to facilitate type narrowing from IResolvedUrl to IRouterliciousResolvedUrl.
	 */
	routerliciousResolvedUrl: true;
	/**
	 * Controls whether a newly created container will be ephemeral. Only affects createContainer requests.
	 */
	createAsEphemeral?: boolean;
}

/**
 * Type guard to detect if an IResolvedUrl is an IRouterliciousResolvedUrl.
 * @alpha
 */
export const isRouterliciousResolvedUrl = (
	resolvedUrl: IResolvedUrl,
): resolvedUrl is IRouterliciousResolvedUrl =>
	(resolvedUrl as IRouterliciousResolvedUrl).routerliciousResolvedUrl === true;
