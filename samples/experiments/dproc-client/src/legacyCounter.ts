/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as counter from "@chaincode/counter";
import { IChaincodeComponent } from "@prague/container-definitions";
import { LegacyChaincodeBridge } from "@prague/container-utils";

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    const code = await counter.instantiate();
    return new LegacyChaincodeBridge(code);
}
