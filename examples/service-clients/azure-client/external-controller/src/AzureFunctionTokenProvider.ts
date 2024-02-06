/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import axios from "axios";

import { AzureMember } from "@fluidframework/azure-client";
import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";

/**
 * Token Provider implementation for connecting to an Azure Function endpoint for
 * Azure Fluid Relay token resolution. Note: this is a simplified implementation of
 * TokenProvider. For production-ready applications, you should consider implementing
 * the TokenProvider with retry logic, token caching, error handling, etc.
 */
export class AzureFunctionTokenProvider implements ITokenProvider {
	/**
	 * Creates a new instance using configuration parameters.
	 * @param azFunctionUrl - URL to Azure Function endpoint
	 * @param user - User object
	 */
	public constructor(
		private readonly azFunctionUrl: string,
		private readonly user?: Pick<AzureMember, "userId" | "userName" | "additionalDetails">,
	) {}

	public async fetchOrdererToken(
		tenantId: string,
		documentId?: string,
		refresh?: boolean,
	): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
			fromCache: false,
		};
	}

	public async fetchStorageToken(
		tenantId: string,
		documentId: string,
		refresh?: boolean,
	): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
			fromCache: false,
		};
	}

	private async getToken(tenantId: string, documentId?: string): Promise<string> {
		const response = await axios.get(this.azFunctionUrl, {
			params: {
				tenantId,
				documentId,
				userId: this.user?.userId,
				userName: this.user?.userName,
				additionalDetails: this.user?.additionalDetails as unknown,
			},
		});
		return response.data as string;
	}
}
