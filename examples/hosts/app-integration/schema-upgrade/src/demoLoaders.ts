/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICodeDetailsLoader,
    IContainer,
    IFluidCodeDetails,
    IFluidModuleWithDetails,
} from "@fluidframework/container-definitions";

import { IMigratableModel } from "./migrationInterfaces";
import { IModelCodeLoader } from "./modelLoading";
// TODO: Maybe build these as standalone demo packages?  Though might be overkill.
import {
    InventoryListContainer as InventoryListContainer1,
    InventoryListContainerRuntimeFactory as InventoryListContainerRuntimeFactory1,
} from "./modelVersion1";
import {
    InventoryListContainer as InventoryListContainer2,
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
export const demoCodeLoader: ICodeDetailsLoader = {
    load: async (source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
        const version = source.package;
        if (typeof version !== "string") {
            throw new Error("Unexpected code detail format");
        }
        switch (version) {
            case "one": return v1ModuleWithDetails;
            case "two": return v2ModuleWithDetails;
            default: throw new Error("Unknown version");
        }
    },
};

// This IModelCodeLoader specifically supports versions one and two.  Other approaches might have network calls to
// dynamically load in the appropriate model for unknown versions.
export class DemoModelCodeLoader implements IModelCodeLoader<IMigratableModel> {
    public readonly supportsVersion = async (version: string) => {
        return version === "one" || version === "two";
    };

    public readonly getModel = async (container: IContainer) => {
        // Here I'm using the specified code details for convenience since it already exists (a real code proposal).
        // However, it could be reasonable to use an alternative in-container storage for the container type (e.g. a
        // standalone Quorum DDS).  The important thing is that we need a dependable way to discover the version of the
        // container, so ideally it remains constant across versions.
        const version = container.getSpecifiedCodeDetails()?.package;
        if (typeof version !== "string") {
            throw new Error("Unexpected code detail format");
        }

        switch (version) {
            case "one": {
                const model = new InventoryListContainer1(container);
                await model.initialize();
                return model;
            }
            case "two": {
                const model = new InventoryListContainer2(container);
                await model.initialize();
                return model;
            }
            default: throw new Error("Unknown version");
        }
    };
}
