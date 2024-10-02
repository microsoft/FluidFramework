/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The odsp-client package provides a simple and powerful way to consume collaborative Fluid data with OneDrive/SharePoint (ODSP) storage.
 *
 * @remarks
 * Please note that odsp-client is currently an experimental package.
 * We'd love for you to try it out and provide feedback but it is not yet recommended or supported for production scenarios.
 *
 * @packageDocumentation
 */

export type {
	OdspConnectionConfig,
	OdspClientProps,
	OdspContainerServices,
	IOdspAudience,
	OdspMember,
	TokenResponse,
} from "./interfaces.js";
export { OdspClient } from "./odspClient.js";
export { type IOdspTokenProvider } from "./token.js";
