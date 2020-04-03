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
import { TestFluidPackageEntries, TestFluidPackageType } from "./types";

export class TestCodeLoader implements ICodeLoader {
    private readonly fluidPackageCache = new Map<string, TestFluidPackageType>();

    constructor(packageEntries: TestFluidPackageEntries) {
        for (const entry of packageEntries) {
            const pkgName = entry[0].package;
            if (pkgName === undefined || typeof(pkgName) !== "string") {
                throw new Error("code details must contain a package name.");
            }
            this.fluidPackageCache.set(pkgName, entry[1]);
        }
    }

    /**
     * @param source - Details of where to find chaincode
     */
    public async load(
        source: IFluidCodeDetails,
    ): Promise<IFluidModule> {
        const pkgName = source.package;
        if (pkgName === undefined || typeof(pkgName) !== "string") {
            throw new Error("code details must contain a package name.");
        }

        const entryPoint = this.fluidPackageCache.get(pkgName);
        if (entryPoint === undefined) {
            throw new Error(`Cannot load package ${pkgName}`);
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
