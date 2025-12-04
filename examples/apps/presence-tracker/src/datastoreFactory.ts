/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Hacky support for empty container.
 */

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import { BasicDataStoreFactory, LoadableFluidObject } from "./datastoreSupport.js";

/**
 * Simple FluidObject nothing.
 */
class EmptyDataObject extends LoadableFluidObject {}

/**
 * Factory class to create empty DO in own data store.
 */
class EmptyDOFactory {
	public is(value: IFluidLoadable | EmptyDO): value is EmptyDO {
		return value instanceof LoadableFluidObject;
	}

	public readonly factory = new BasicDataStoreFactory(
		"@fluid-example/presence-tracker",
		EmptyDataObject,
	);
}

/**
 * Brand for Empty Presence Data Object.
 */
export declare class EmptyDO {
	private readonly _self: EmptyDO;
}

/**
 * EmptyDO Factory
 * Export SharedObjectKind for registration.
 */
export const EmptyDOEntry = new EmptyDOFactory() as unknown as SharedObjectKind<
	IFluidLoadable & EmptyDO
>;
