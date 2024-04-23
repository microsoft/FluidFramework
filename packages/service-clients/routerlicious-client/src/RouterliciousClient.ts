/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseClient } from "@fluidframework/base-client";
import {
	RouterliciousUrlResolver,
	createRouterliciousCreateNewRequest,
} from "./RouterliciousUrlResolver.js";
import type { RouterliciousClientProps } from "./interfaces.js";

/**
 * AzureClient provides the ability to have a Fluid object backed by the Azure Fluid Relay or,
 * when running with local tenantId, have it be backed by a local Azure Fluid Relay instance.
 * @public
 */
export class RouterliciousClient extends BaseClient {
	public constructor(properties: RouterliciousClientProps) {
		super(
			properties,
			new RouterliciousUrlResolver(properties.connection),
			createRouterliciousCreateNewRequest,
		);
	}
}
