/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import {
    ICodeLoader,
    IProvideRuntimeFactory,
    IFluidModule,
    IFluidCodeDetails,
} from "@microsoft/fluid-container-definitions";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";

// Represents the entry point for a fluid container.
export type fluidEntryPoint = Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>;

/**
 * A simple code loader that caches a mapping of package name to a fluid entry point.
 * On load, it retrieves the entry point matching the package name in the given code details.
 */
export class LocalCodeLoader implements ICodeLoader {
    private readonly fluidPackageCache = new Map<string, fluidEntryPoint>();

    constructor(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>) {
        for (const entry of packageEntries) {
            // Store the entry point against a unique id in the fluidPackageCache.
            // For code details containing a package name, use the package name as the id.
            // For code details containing a fluid package, create a unique id from the package name and version.
            let pkgId: string;

            const source = entry[0];
            if (typeof source.package === "string") {
                pkgId = source.package;
            } else {
                pkgId = `${source.package.name}@${source.package.version}`;
            }

            this.fluidPackageCache.set(pkgId, entry[1]);
        }
    }

    /**
     * It finds the entry point for the package name in the given source and return it
     * as a fluid module.
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        // Get the entry point for from the fluidPackageCache for the given code details.
        // For code details containing a package name, use the package name as the id.
        // For code details containing a fluid package, create a unique id from the package name and version.
        let pkdId: string;

        if (typeof source.package === "string") {
            pkdId = source.package;
        } else {
            pkdId = `${source.package.name}@${source.package.version}`;
        }

        const entryPoint = this.fluidPackageCache.get(pkdId);
        if (entryPoint === undefined) {
            throw new Error(`Cannot find package ${pkdId}`);
        }
        const factory: Partial<IProvideRuntimeFactory & IProvideComponentFactory> =
            entryPoint.fluidExport ?? entryPoint;
        const runtimeFactory: IProvideRuntimeFactory =
            factory.IRuntimeFactory ??
                new SimpleModuleInstantiationFactory("default", [["default", Promise.resolve(factory)]]);

        const fluidModule: IFluidModule = { fluidExport: runtimeFactory };
        return fluidModule;
    }
}
