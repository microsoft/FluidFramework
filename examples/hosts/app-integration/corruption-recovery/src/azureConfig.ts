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

// Define the server we will be using and initialize Fluid
const useAzure = process.env.FLUID_CLIENT === "azure";

const user = generateTestUser();

const userConfig = {
    id: user.id,
    name: user.name,
};

export const connectionConfig: AzureConnectionConfig = useAzure
    ? {
          tenantId: "YOUR-TENANT-ID-HERE",
          tokenProvider: new AzureFunctionTokenProvider(
              "AZURE-FUNCTION-URL/api/GetAzureToken",
              { userId: "test-user", userName: "Test User" },
          ),
          orderer: "ENTER-ORDERER-URL-HERE",
          storage: "ENTER-STORAGE-URL-HERE",
      }
    : {
          tenantId: LOCAL_MODE_TENANT_ID,
          tokenProvider: new InsecureTokenProvider("fooBar", userConfig),
          orderer: "http://localhost:7070",
          storage: "http://localhost:7070",
      };
