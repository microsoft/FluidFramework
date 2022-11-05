/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AzureFunctionTokenProvider, ITokenProvider } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-client-utils";

export function createAzureTokenProvider(userID?: string, userName?: string): ITokenProvider {
    const fnUrl = process.env.azure__fluid__relay__service__function__url as string;
    const key = process.env.azure__fluid__relay__service__key as string;

    const userConfig = {
        id: userID ?? "foo",
        name: userName ?? "bar",
    };

    if (fnUrl) {
        return new AzureFunctionTokenProvider(`${fnUrl}/api/GetFrsToken`, {
            userId: userID ?? "foo",
            userName: userName ?? "bar",
        });
    } else if (key) {
        return new InsecureTokenProvider(key, userConfig);
    } else {
        throw new Error("Cannot create token provider.");
    }
}
