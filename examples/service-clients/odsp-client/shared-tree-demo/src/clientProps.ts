/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspClientProps, OdspConnectionConfig } from "@fluidframework/odsp-client/beta";

import { OdspTestTokenProvider } from "./tokenProvider.js";

export interface OdspTestCredentials {
	SITE_URL: string;
	SPE_DRIVE_ID: string;
	SPE_CLIENT_ID: string;
	SPE_ENTRA_TENANT_ID: string;
}

declare global {
	const process: {
		env: OdspTestCredentials;
	};
}

const connectionConfig: OdspConnectionConfig = {
	tokenProvider: new OdspTestTokenProvider(),
	siteUrl: process.env.SITE_URL,
	driveId: process.env.SPE_DRIVE_ID,
	filePath: "",
};

export const clientProps: OdspClientProps = {
	connection: connectionConfig,
};
