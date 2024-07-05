/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureMember } from "@fluidframework/azure-client";
import type { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";
import axios from "axios";

/**
 * Token Provider implementation for connecting to an Azure Function endpoint for
 * Azure Fluid Relay token resolution.
 *
 * @internal
 */
export class AzureFunctionTokenProvider implements ITokenProvider {
	/**
	 * Creates a new instance using configuration parameters.
	 * @param azFunctionUrl - URL to Azure Function endpoint
	 * @param user - User object
	 */
	public constructor(
		private readonly azFunctionUrl: string,
		private readonly user?: Pick<AzureMember, "id" | "name" | "additionalDetails">,
	) {}

	public async fetchOrdererToken(
		tenantId: string,
		documentId?: string,
	): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
		};
	}

	public async fetchStorageToken(
		tenantId: string,
		documentId: string,
	): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
		};
	}

	private async getToken(tenantId: string, documentId?: string): Promise<string> {
		const response = await axios.get(this.azFunctionUrl, {
			params: {
				tenantId,
				documentId,
				id: this.user?.id,
				name: this.user?.name,
				additionalDetails: this.user?.additionalDetails as unknown,
			},
		});
		return response.data as string;
	}
}
