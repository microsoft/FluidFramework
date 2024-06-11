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
type RequireAssignableTo<TTarget extends TSource, TSource> = true;

// Type tests for InitialObjects
{
	// ContainerSchema case
	{
		type A = InitialObjects<ContainerSchema>;
		type B = RequireAssignableTo<A, Record<string, unknown>>;
		type C = RequireAssignableTo<Record<string, IFluidLoadable>, A>;
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
		type A = InitialObjects<ContainerSchemaWith<SharedObjectKind>>["item"];
		type B = RequireAssignableTo<A, unknown>;
		type C = RequireAssignableTo<unknown, A>;
	}

	// SharedObject case
	{
		type A = InitialObjects<ContainerSchemaWith<TestSharedObjectFactory>>["item"];
		type B = RequireAssignableTo<A, TestSharedObject>;
		type C = RequireAssignableTo<TestSharedObject, A>;
	}
}
