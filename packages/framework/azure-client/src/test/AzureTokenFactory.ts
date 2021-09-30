/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureFunctionTokenProvider } from "..";

export function createAzureTokenProvider(): AzureFunctionTokenProvider {
    const fnUrl = process.env.fluid__webpack__fnUrl as string;
    return new AzureFunctionTokenProvider(
        `${fnUrl}/api/GetFrsToken`,
        { userId: "foo", userName: "bar" },
    );
}
