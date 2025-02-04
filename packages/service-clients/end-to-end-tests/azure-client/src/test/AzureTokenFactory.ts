/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenProvider } from "@fluidframework/azure-client";
import type { ScopeType } from "@fluidframework/driver-definitions/internal";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";

export function createAzureTokenProvider(
	id: string,
	name: string,
	scopes?: ScopeType[],
): ITokenProvider {
	const key = process.env.azure__fluid__relay__service__key as string;
	if (key) {
		const userConfig = {
			id,
			name,
		};
		return new InsecureTokenProvider(key, userConfig, scopes);
	} else {
		throw new Error("Cannot create token provider.");
	}
}
