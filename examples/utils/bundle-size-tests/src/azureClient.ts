/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient } from "@fluidframework/azure-client";

export function apisToBundle(): void {
	new AzureClient({} as any);
}
