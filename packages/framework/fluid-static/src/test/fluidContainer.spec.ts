/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IChannel } from "@fluidframework/datastore-definitions";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base";
import type { InitialObjects } from "../index.js";
import type { ContainerSchema, DataObjectClass, LoadableObjectClass } from "../types.js";

/**
 * Compile time assert that A is assignable to (extends) B.
 * To use, simply define a type:
 * `type _check = requireAssignableTo<T, Expected>;`
 */
export type requireAssignableTo<_A extends B, B> = true;

// Type tests for InitialObjects
{
	// ContainerSchema case
	{
		type _a = InitialObjects<ContainerSchema>;
		type _b = requireAssignableTo<_a, Record<string, IFluidLoadable>>;
		type _c = requireAssignableTo<Record<string, IFluidLoadable>, _a>;
	}
	type ContainerSchemaWith<T> = ContainerSchema & { initialObjects: { item: T } };
	interface TestSharedObject extends IChannel {
		x: number;
	}
	interface TestSharedObjectFactory extends ISharedObjectKind<TestSharedObject> {
		y: number;
	}

	interface TestDataObject extends IFluidLoadable {
		x: number;
	}
	interface TestDataObjectFactory extends DataObjectClass<TestDataObject> {
		y: number;
	}

	// LoadableObjectClass case
	{
		type _a = InitialObjects<ContainerSchemaWith<LoadableObjectClass>>["item"];
		type _b = requireAssignableTo<_a, IFluidLoadable>;
		type _c = requireAssignableTo<IFluidLoadable, _a>;
	}

	// SharedObject case
	{
		type _a = InitialObjects<ContainerSchemaWith<TestSharedObjectFactory>>["item"];
		type _b = requireAssignableTo<_a, TestSharedObject>;
		type _c = requireAssignableTo<TestSharedObject, _a>;
	}

	// DataObject case
	{
		type _a = InitialObjects<ContainerSchemaWith<TestDataObjectFactory>>["item"];
		type _b = requireAssignableTo<_a, TestDataObject>;
		type _c = requireAssignableTo<TestDataObject, _a>;
	}
}
