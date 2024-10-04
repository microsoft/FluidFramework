/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import { IOdspTokenProvider, OdspClientProps } from "@fluidframework/odsp-client/beta";

// Create the client props for the Fluid client
export const getClientProps = (
	siteUrl: string,
	driveId: string,
	tokenProvider: IOdspTokenProvider,
): OdspClientProps => {
	const connectionConfig = {
		tokenProvider,
		siteUrl,
		driveId,
		filePath: "",
	};

	return {
		connection: connectionConfig,
	};
};
