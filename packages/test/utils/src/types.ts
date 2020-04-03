/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IProvideRuntimeFactory,
    IFluidModule,
    IFluidCodeDetails,
} from "@microsoft/fluid-container-definitions";
import { IProvideComponentFactory } from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";

export type TestFluidPackageType = Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>;

export type TestFluidPackageEntries = Iterable<[IFluidCodeDetails, TestFluidPackageType]>;

export type TestSharedObjectFactoryEntries = Iterable<[string, ISharedObjectFactory]>;
