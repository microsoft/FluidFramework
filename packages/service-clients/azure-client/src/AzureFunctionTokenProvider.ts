/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import axios from "axios";

import { type ITokenProvider, type ITokenResponse } from "@fluidframework/routerlicious-driver";

import { type AzureMember } from "./interfaces.js";

/**
 * Token Provider implementation for connecting to an Azure Function endpoint for
 * Azure Fluid Relay token resolution.
 *
 * @deprecated 1.2.0, This API will be removed in 2.0.0
 * No replacement since it is not expected anyone will use this token provider as is
 * See https://github.com/microsoft/FluidFramework/issues/13693 for context
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
		private readonly user?: Pick<AzureMember, "userId" | "userName" | "additionalDetails">,
	) {}

	public async fetchOrdererToken(tenantId: string, documentId?: string): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
		};
	}

	public async fetchStorageToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
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
