/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureFunctionTokenProvider, ITokenProvider } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

export function createAzureTokenProvider(userId: string, userName: string): ITokenProvider {
	const fnUrl = process.env.azure__fluid__relay__service__function__url as string;
	const key = process.env.azure__fluid__relay__service__key as string;

	if (fnUrl) {
		return new AzureFunctionTokenProvider(`${fnUrl}/api/GetFrsToken`, {
			userId,
			userName,
		});
	} else if (key) {
		const userConfig = {
			id: userId,
			name: userName,
		};
		return new InsecureTokenProvider(key, userConfig);
	} else {
		throw new Error("Cannot create token provider.");
	}
}
