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

// This represents the entry point of a test fluid container.
export type TestFluidPackageType = Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>;

// This represents a list of code details to a fluid entry point that will be used to create / load a test container.
export type TestFluidPackageEntries = Iterable<[IFluidCodeDetails, TestFluidPackageType]>;

// This represents a list of id to shared object factory that the TestFluidComponentFactory is created with. For each
// entry, a shared object is created by the TestFluidComponent.
export type TestSharedObjectFactoryEntries = Iterable<[string, ISharedObjectFactory]>;
