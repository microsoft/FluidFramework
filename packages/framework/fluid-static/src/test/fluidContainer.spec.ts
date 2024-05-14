/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";

import type { InitialObjects } from "../index.js";
import type { ContainerSchema } from "../types.js";

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
		type _b = requireAssignableTo<_a, Record<string, unknown>>;
		type _c = requireAssignableTo<Record<string, IFluidLoadable>, _a>;
	}
	type ContainerSchemaWith<T extends SharedObjectKind> = ContainerSchema & {
		initialObjects: { item: T };
	};
	interface TestSharedObject extends IChannel {
		x: number;
	}
	interface TestSharedObjectFactory extends SharedObjectKind<TestSharedObject> {
		y: number;
	}

	interface TestDataObject extends IFluidLoadable {
		x: number;
	}

	// SharedObjectKind case
	{
		type _a = InitialObjects<ContainerSchemaWith<SharedObjectKind>>["item"];
		type _b = requireAssignableTo<_a, unknown>;
		type _c = requireAssignableTo<unknown, _a>;
	}

	// SharedObject case
	{
		type _a = InitialObjects<ContainerSchemaWith<TestSharedObjectFactory>>["item"];
		type _b = requireAssignableTo<_a, TestSharedObject>;
		type _c = requireAssignableTo<TestSharedObject, _a>;
	}
}
