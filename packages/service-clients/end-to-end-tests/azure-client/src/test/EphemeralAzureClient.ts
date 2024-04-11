/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, type AzureClientProps } from "@fluidframework/azure-client";
import { AzureUrlResolver } from "@fluidframework/azure-client/internal";
import { type IRequest } from "@fluidframework/core-interfaces";
import { type IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { IRouterliciousResolvedUrl } from "@fluidframework/routerlicious-driver/internal";

export class EphemeralAzureUrlResolver extends AzureUrlResolver {
	public async resolve(request: IRequest): Promise<IResolvedUrl> {
		const res: IResolvedUrl = await super.resolve(request);
		const augmentedRes: IRouterliciousResolvedUrl = {
			...res,
			routerliciousResolvedUrl: true,
			createAsEphemeral: true,
		};
		return augmentedRes;
	}
}

export class EphemeralAzureClient extends AzureClient {
	constructor(properties: AzureClientProps) {
		super(properties);
		this.urlResolver = new EphemeralAzureUrlResolver();
	}
}
