/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import {
    ICodeLoader,
    IProvideRuntimeFactory,
    IFluidModule,
} from "@fluidframework/container-definitions";
import { IFluidCodeDetails } from "@fluidframework/core-interfaces";
import { IProvideFluidDataStoreFactory, IProvideFluidDataStoreRegistry } from "@fluidframework/runtime-definitions";

// Represents the entry point for a Fluid container.
export type fluidEntryPoint = Partial<
    IProvideRuntimeFactory &
    IProvideFluidDataStoreFactory &
    IProvideFluidDataStoreRegistry &
    IFluidModule>;

/**
 * A simple code loader that caches a mapping of package name to a Fluid entry point.
 * On load, it retrieves the entry point matching the package name in the given code details.
 */
export class LocalCodeLoader implements ICodeLoader {
    private readonly fluidPackageCache = new Map<string, fluidEntryPoint>();

    constructor(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>) {
        for (const entry of packageEntries) {
            // Store the entry point against a unique id in the fluidPackageCache.
            // For code details containing a package name, use the package name as the id.
            // For code details containing a Fluid package, create a unique id from the package name and version.
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
     * as a Fluid module.
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        // Get the entry point for from the fluidPackageCache for the given code details.
        // For code details containing a package name, use the package name as the id.
        // For code details containing a Fluid package, create a unique id from the package name and version.
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

        const factory = (entryPoint.fluidExport ?? entryPoint) as fluidEntryPoint;

        if (factory.IRuntimeFactory !== undefined) {
            return { fluidExport: factory.IRuntimeFactory };
        }

        assert(factory.IFluidDataStoreFactory !== undefined || factory.IFluidDataStoreRegistry !== undefined);
        const fluidExport: IProvideRuntimeFactory =
            new ContainerRuntimeFactoryWithDefaultDataStore("default", [["default", Promise.resolve(factory)]]);

        return { fluidExport };
    }
}
