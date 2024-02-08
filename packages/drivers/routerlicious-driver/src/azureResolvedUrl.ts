/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IResolvedUrl } from "@fluidframework/driver-definitions";

/**
 * Azure extends the resolved url with additional properties to control Azure-specific behaviors.
 * @alpha
 */
export interface IAzureResolvedUrl extends IResolvedUrl {
	/**
	 * A flag to facilitate type narrowing from IResolvedUrl to IAzureResolvedUrl.
	 */
	azureResolvedUrl: true;
	/**
	 * Controls whether a newly created container will be ephemeral. Only affects createContainer requests.
	 */
	createAsEphemeral?: boolean;
}

/**
 * Type guard to detect if an IResolvedUrl is an IAzureResolvedUrl.
 * @alpha
 */
export const isAzureResolvedUrl = (resolvedUrl: IResolvedUrl): resolvedUrl is IAzureResolvedUrl =>
	(resolvedUrl as IAzureResolvedUrl).azureResolvedUrl === true;
