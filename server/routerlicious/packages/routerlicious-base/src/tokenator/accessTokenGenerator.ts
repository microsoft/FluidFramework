import { NetworkError } from "@fluidframework/server-services-client";
import type { IAccessToken, IAccessTokenGenerator } from "@fluidframework/server-services-core";

export class AccessTokenGenerator implements IAccessTokenGenerator {
	public async generateToken(
		tenantId: string,
		documentId?: string,
		customClaims?: any,
	): Promise<IAccessToken> {
		throw new NetworkError(
			501,
			"Access token generation is not implemented.",
			false /* canRetry */,
		);
	}
}
