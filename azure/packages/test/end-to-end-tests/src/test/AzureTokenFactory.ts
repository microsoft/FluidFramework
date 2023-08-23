/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITokenProvider } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";

export function createAzureTokenProvider(userId: string, userName: string): ITokenProvider {
	const key = process.env.azure__fluid__relay__service__key as string;
	if (key) {
		const userConfig = {
			id: userId,
			name: userName,
		};
		return new InsecureTokenProvider(key, userConfig);
	} else {
		throw new Error("Cannot create token provider.");
	}
}
