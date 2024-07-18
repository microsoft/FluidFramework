/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IResolvedUrl } from "@fluidframework/driver-definitions/internal";

/**
 * Routerlicious extends the resolved url with additional properties to control Routerlicious-specific behaviors.
 *
 * @privateRemarks
 * {@link isRouterliciousResolvedUrl} can be used to detect whether an {@link @fluidframework/driver-definitions#IResolvedUrl}
 * is an IRouterliciousResolvedUrl.
 *
 * @legacy
 * @alpha
 */
export interface IRouterliciousResolvedUrl extends IResolvedUrl {
	/**
	 * A flag to facilitate type narrowing from {@link @fluidframework/driver-definitions#IResolvedUrl} to IRouterliciousResolvedUrl.
	 */
	routerliciousResolvedUrl: true;
	/**
	 * Controls whether a newly created container will be ephemeral, which means the service will not retain it
	 * after the collaboration session ends. Only affects
	 * {@link @fluidframework/driver-definitions#IDocumentServiceFactory.createContainer} requests.
	 *
	 * @defaultValue If left undefined, treated as `false`
	 */
	createAsEphemeral?: boolean;
}

/**
 * Type guard to detect if an IResolvedUrl is an IRouterliciousResolvedUrl.
 * @internal
 */
export const isRouterliciousResolvedUrl = (
	resolvedUrl: IResolvedUrl,
): resolvedUrl is IRouterliciousResolvedUrl =>
	(resolvedUrl as IRouterliciousResolvedUrl).routerliciousResolvedUrl === true;
