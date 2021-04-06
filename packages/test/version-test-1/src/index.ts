/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";
import { IProvideFluidCodeDetailsComparer } from "@fluidframework/core-interfaces";
import { createDataStoreFactory } from "@fluidframework/runtime-utils";
import { IProvideRuntimeFactory } from "@fluidframework/container-definitions";

import { VersiontestInstantiationFactory } from "./main";

const fluidPackageName = "@fluid-internal/version-test-1";

const defaultFactory = createDataStoreFactory(fluidPackageName, VersiontestInstantiationFactory);

export const fluidExport: IProvideRuntimeFactory & IProvideFluidCodeDetailsComparer = {
    IRuntimeFactory: new ContainerRuntimeFactoryWithDefaultDataStore(
        defaultFactory,
        new Map([
            [defaultFactory.type, Promise.resolve(defaultFactory)],
        ])),
    IFluidCodeDetailsComparer
};
