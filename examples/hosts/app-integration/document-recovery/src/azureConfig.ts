/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AzureFunctionTokenProvider,
    AzureConnectionConfig,
    LOCAL_MODE_TENANT_ID,
} from "@fluidframework/azure-client";
import {
    generateTestUser,
    InsecureTokenProvider,
} from "@fluidframework/test-client-utils";

export interface ICustomUserDetails {
    gender: string;
    email: string;
}

const userDetails: ICustomUserDetails = {
    gender: "female",
    email: "xyz@microsoft.com",
};

// Define the server we will be using and initialize Fluid
const useAzure = process.env.FLUID_CLIENT === "azure";

const user = generateTestUser();

const azureUser = {
    userId: user.id,
    userName: user.name,
    additionalDetails: userDetails,
};

const connectionConfig: AzureConnectionConfig = useAzure ? {
    tenantId: "",
    tokenProvider: new AzureFunctionTokenProvider("", azureUser),
    orderer: "",
    storage: "",
} : {
    tenantId: LOCAL_MODE_TENANT_ID,
    tokenProvider: new InsecureTokenProvider("fooBar", user),
    orderer: "http://localhost:7070",
    storage: "http://localhost:7070",
};
