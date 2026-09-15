/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { requireAssignableTo } from "@fluidframework/build-tools";

import type {
	formParentContext,
	IFluidParentContextPrivate,
	IFluidRootParentContextPrivate,
} from "../../channelCollection.js";
import type { ContainerRuntime } from "../../containerRuntime.js";
import type { FluidDataStoreContext } from "../../dataStoreContext.js";

// ContainerRuntime adapts submitSignal when constructing the root parent context.
declare type _checkContainerRuntimeParentContext = requireAssignableTo<
	ContainerRuntime,
	Omit<IFluidRootParentContextPrivate, "submitSignal">
>;

declare type _checkRootParentContextWrapper = requireAssignableTo<
	ReturnType<typeof formParentContext<IFluidRootParentContextPrivate>>,
	IFluidRootParentContextPrivate
>;

declare type _checkDataStoreParentContext = requireAssignableTo<
	FluidDataStoreContext,
	IFluidParentContextPrivate
>;
