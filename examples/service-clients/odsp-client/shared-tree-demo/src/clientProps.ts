/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspClientProps, OdspConnectionConfig } from "@fluidframework/odsp-client/beta";

import { OdspTestTokenProvider } from "./tokenProvider.js";

export interface OdspTestCredentials {
	siteUrl: string;
	driveId: string;
}

export const props: OdspTestCredentials = {
	siteUrl: "<site__url>",
	driveId: "<drive__id>",
};

const connectionConfig: OdspConnectionConfig = {
	tokenProvider: new OdspTestTokenProvider(),
	siteUrl: props.siteUrl,
	driveId: props.driveId,
	filePath: "",
};

export const clientProps: OdspClientProps = {
	connection: connectionConfig,
};
