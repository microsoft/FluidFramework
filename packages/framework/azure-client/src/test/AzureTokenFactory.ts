/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureFunctionTokenProvider } from "..";

export function createAzureTokenProvider(): AzureFunctionTokenProvider {
    const tenantKey = process.env.fluid__webpack__tenantKey as string;
    const userId = process.env.fluid__webpack__userId as string;
    const userName = process.env.fluid__webpack__userName as string;

    return new AzureFunctionTokenProvider(
        `${tenantKey}/api/GetAzureToken`,
        { userId, userName },
    );
}
