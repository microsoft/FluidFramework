/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import axios from "axios";

import { ITokenProvider, ITokenResponse } from "@fluidframework/routerlicious-driver";

import { AzureMember } from "./interfaces";

/**
 * Token Provider implementation for connecting to an Azure Function endpoint for
 * Azure Fluid Relay token resolution.
 *
 * @deprecated 1.2.0, This API will be removed in 2.0.0
 * @remarks No replacement since it is not expected anyone will use this token provider as is.
 * @see {@link https://github.com/microsoft/FluidFramework/issues/13693} for context
 */
export class AzureFunctionTokenProvider implements ITokenProvider {
	/**
	 * Creates a new instance using configuration parameters.
	 *
	 * @param azFunctionUrl - URL to Azure Function endpoint
	 * @internal
	 *
	 * @param user - User object containing user details
	 * @defaultValue None. Optional during class instantiation.
	 * @internal
	 *
	 * @remarks The `user` object is optional and can be omitted.
	 */
	public constructor(
		private readonly azFunctionUrl: string,
		private readonly user?: Pick<AzureMember, "userId" | "userName" | "additionalDetails">,
	) {}

	/**
	 * Fetches the Orderer Token.
	 *
	 * @param tenantId - The tenant ID
	 * @param documentId - The document ID (optional)
	 * @returns A Promise that resolves to an ITokenResponse object
	 * @public
	 */
	public async fetchOrdererToken(tenantId: string, documentId?: string): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
		};
	}

	/**
	 * Fetches the Storage Token.
	 *
	 * @param tenantId - The tenant ID
	 * @param documentId - The document ID
	 * @returns A Promise that resolves to an ITokenResponse object
	 * @public
	 */
	public async fetchStorageToken(tenantId: string, documentId: string): Promise<ITokenResponse> {
		return {
			jwt: await this.getToken(tenantId, documentId),
		};
	}

	/**
	 * Retrieves the token.
	 *
	 * @param tenantId - The tenant ID
	 * @param documentId - The document ID (optional)
	 * @returns A Promise that resolves to a string containing the JWT token
	 */
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
