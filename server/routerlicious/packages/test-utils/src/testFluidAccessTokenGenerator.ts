/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import type {
	IFluidAccessToken,
	IFluidAccessTokenGenerator,
} from "@fluidframework/server-services-core";

export class TestFluidAccessTokenGenerator implements IFluidAccessTokenGenerator {
	private failSignatureValidation: boolean = false;
	private failAuthorizationValidation: boolean = false;

	public setFailSignatureValidation(): void {
		this.failSignatureValidation = true;
	}

	public setFailAuthorizationValidation(): void {
		this.failAuthorizationValidation = true;
	}

	public async generateFluidToken(
		tenantId: string,
		bearerAuthToken: string,
		requestBody?: Record<string, any>,
	): Promise<IFluidAccessToken> {
		const tokenRegex = /Bearer (.+)/;
		const tokenMatch = tokenRegex.exec(bearerAuthToken); // Returns null if there is no match
		if (tokenMatch === null) {
			throw new NetworkError(400, "Invalid bearer access token", false /* canRetry */);
		}
		const token = tokenMatch[1];
		if (!token || typeof token !== "string") {
			throw new NetworkError(400, "Invalid bearer access token", false /* canRetry */);
		}
		if (this.failSignatureValidation) {
			throw new NetworkError(401, "Token user is not authorized", false /* canRetry */);
		}
		if (this.failAuthorizationValidation) {
			throw new NetworkError(403, "Token user does not have access", false /* canRetry */);
		}
		const dummyToken: IFluidAccessToken = {
			fluidAccessToken: "12345",
		};
		return dummyToken;
	}
}
