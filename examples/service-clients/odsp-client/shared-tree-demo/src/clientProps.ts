/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { OdspClientProps, OdspConnectionConfig } from "@fluid-experimental/odsp-client";
import { OdspTestTokenProvider } from "./tokenProvider";

export interface OdspTestCredentials {
	siteUrl: string;
	driveId: string;
	clientId: string;
}

export const props: OdspTestCredentials = {
	siteUrl: "<site__url>",
	driveId: "<drive__id>",
	clientId: "<client__id>",
};

const connectionConfig: OdspConnectionConfig = {
	tokenProvider: new OdspTestTokenProvider(props.clientId),
	siteUrl: props.siteUrl,
	driveId: props.driveId,
};

export const clientProps: OdspClientProps = {
	connection: connectionConfig,
};
