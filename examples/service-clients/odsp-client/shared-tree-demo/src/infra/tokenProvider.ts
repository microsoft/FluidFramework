import { AzureMember, ITokenProvider, ITokenResponse } from "@fluidframework/azure-client";

import axios from "axios";
import { Guid } from "guid-typescript";
import { IInsecureUser } from "@fluidframework/test-runtime-utils";

const generateTestUser = (): IInsecureUser => {
	const user = {
		id: Guid.create().toString(),
		name: "[TEST USER]",
	};
	return user;
};

/**
 * Token Provider implementation for connecting to an Azure Function endpoint for
 * Azure Fluid Relay token resolution.
 */
export class AzureFunctionTokenProvider implements ITokenProvider {
	/**
	 * Creates a new instance using configuration parameters.
	 * @param azFunctionUrl - URL to Azure Function endpoint
	 * @param user - User object
	 */
	constructor(
		private readonly azFunctionUrl: string,
		private readonly user?: Pick<AzureMember, "userName" | "additionalDetails">,
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

	private async getToken(tenantId: string, documentId: string | undefined): Promise<string> {
		const response = await axios.get(this.azFunctionUrl, {
			params: {
				tenantId,
				documentId,
				userName: this.user?.userName,
				additionalDetails: this.user?.additionalDetails,
			},
		});
		return response.data as string;
	}
}

export const user = generateTestUser();

export const azureUser = {
	userId: user.id,
	userName: user.name,
};
