/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeDetailsLoader,
    IFluidCodeDetails,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";

import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./modelVersion1";
import {
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory2,
} from "./modelVersion2";

const v1ModuleWithDetails: IFluidModuleWithDetails = {
    module: { fluidExport: new InventoryListContainerRuntimeFactory1() },
    details: { package: "one" },
};

const v2ModuleWithDetails: IFluidModuleWithDetails = {
    module: { fluidExport: new InventoryListContainerRuntimeFactory2() },
    details: { package: "two" },
};

// This ICodeDetailsLoader specifically supports versions one and two.  Other approaches might have network calls to
// dynamically load in the appropriate code for unknown versions.
export class DemoCodeLoader implements ICodeDetailsLoader {
    public async load(source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
        const version = source.package;
        if (typeof version !== "string") {
            throw new Error("Unexpected code detail format");
        }
        switch (version) {
            case "one": return v1ModuleWithDetails;
            case "two": return v2ModuleWithDetails;
            default: throw new Error("Unknown version");
        }
    }
}
