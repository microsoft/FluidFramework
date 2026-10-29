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

/**
 * Checks that ContainerRuntime provides the private root-parent context members.
 * Excludes submitSignal because the runtime adapts its signature when constructing the context.
 */
declare type _checkContainerRuntimeParentContext = requireAssignableTo<
	ContainerRuntime,
	Omit<IFluidRootParentContextPrivate, "submitSignal">
>;

/**
 * Checks that formParentContext preserves the complete private root-parent context contract
 * after replacing submitMessage and submitSignal with the supplied overrides.
 */
declare type _checkRootParentContextWrapper = requireAssignableTo<
	ReturnType<typeof formParentContext<IFluidRootParentContextPrivate>>,
	IFluidRootParentContextPrivate
>;

/**
 * Checks that FluidDataStoreContext satisfies the private parent-context contract,
 * including its required isReadOnly method and container extension access.
 */
declare type _checkDataStoreParentContext = requireAssignableTo<
	FluidDataStoreContext,
	IFluidParentContextPrivate
>;
