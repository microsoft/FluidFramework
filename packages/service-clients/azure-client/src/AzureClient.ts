/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseClient, type BaseClientProps } from "@fluidframework/client-base";
import { AzureUrlResolver, createAzureCreateNewRequest } from "./AzureUrlResolver.js";

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Fluid Relay or,
 * when running with local tenantId, have it be backed by a local Azure Fluid Relay instance.
 * @public
 */
export class AzureClient extends BaseClient {
	public constructor(properties: BaseClientProps) {
		super(properties, new AzureUrlResolver(), createAzureCreateNewRequest);
	}
}
