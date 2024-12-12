/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The connection status of the {@link ISessionClient}.
 *
 * @alpha
 */
export const SessionClientStatusEnum = {
	/**
	 * The session client is connected to the Fluid service.
	 */
	Connected: "Connected",

	/**
	 * The session client is not connected to the Fluid service.
	 */
	Disconnected: "Disconnected",
} as const;
