/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { OdspClientProps, OdspConnectionConfig } from "@fluid-experimental/odsp-client";
import { OdspTestTokenProvider } from "./tokenProvider";

export interface OdspTestCredentials {
	clientId: string;
	clientSecret: string;
	username: string;
	password: string;
}

/**
 * Default test credentials for odsp-client.
 */
const clientCreds: OdspTestCredentials = {
	clientId: "<client_id>",
	clientSecret: "<client_secret>",
	username: "<email_id>",
	password: "<password>",
};

const connectionConfig: OdspConnectionConfig = {
	tokenProvider: new OdspTestTokenProvider(clientCreds), // Token provider using the provided test credentials.
	siteUrl: "<site_url>",
	driveId: "<raas_drive_id>",
};

export const clientProps: OdspClientProps = {
	connection: connectionConfig,
};
