/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";
import { AttachState } from "@fluidframework/container-definitions";

export async function waitForAttach(componentRuntime: IFluidDataStoreRuntime): Promise<void> {
    if (componentRuntime.attachState === AttachState.Attached) {
        return;
    }

    return new Promise((resolve) => {
        componentRuntime.once(
            "attached",
            () => {
                Promise.resolve().then(() => resolve()).catch(() => { });
            });
    });
}
