/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeDetailsLoader,
    IFluidCodeDetails,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";

import { CollaborativeTextContainerRuntimeFactory } from "./container";

const v1Factory = new CollaborativeTextContainerRuntimeFactory();

export class AppCodeLoader implements ICodeDetailsLoader {
    public async load(details: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
        if (details.package === "1.0") {
            return {
                module: { fluidExport: v1Factory },
                details,
            };
        }
        throw new Error("Unknown version");
    }
}
