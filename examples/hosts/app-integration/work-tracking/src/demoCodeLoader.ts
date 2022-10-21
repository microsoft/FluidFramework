/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
    ICodeDetailsLoader,
    IFluidCodeDetails,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";

import {
    InventoryListContainerRuntimeFactory,
} from "./model";

const moduleWithDetails: IFluidModuleWithDetails = {
    module: { fluidExport: new InventoryListContainerRuntimeFactory() },
    details: { package: "one" },
};

// This ICodeDetailsLoader specifically supports versions one and two.  Other approaches might have network calls to
// dynamically load in the appropriate code for unknown versions.
export class DemoCodeLoader implements ICodeDetailsLoader {
    public async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
        const version = source.package;
        if (typeof version !== "string") {
            throw new TypeError("Unexpected code detail format");
        }
        switch (version) {
            case "one": return moduleWithDetails;
            default: throw new Error("Unknown version");
        }
    }
}
