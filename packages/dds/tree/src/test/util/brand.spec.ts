/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";
import {
	type Brand,
	brand,
	brandConst,
	strictEnum,
	unbrand,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import-x/no-internal-modules */
} from "../../util/brand.js";
import type {
	requireAssignableTo,
	areSafelyAssignable,
	isAssignableTo,
	requireFalse,
	requireTrue,
	Values,
} from "../../util/index.js";
import { allowUnused } from "../../simple-tree/index.js";
import { unreachableCase } from "@fluidframework/core-utils/internal";

// These tests currently just cover the type checking, so its all compile time.

export type T1 = Brand<number, "1">;
export type T2 = Brand<number, "2">;

type Intersected = T1 & T2;
type T1Constant = Brand<4, "1">;

type _check =
	// Check covariant ValueType
	| requireTrue<isAssignableTo<T1Constant, T1>>
	| requireFalse<isAssignableTo<T1, T2>>
	// Check multiple brands don't produce never.
	| requireFalse<isAssignableTo<Intersected, never>>;

const _branded: T1 = brand(0);

// Ensure optional fields can be assigned from brand.
const _branded2: T1 | undefined = brand(0);

// @ts-expect-error No type to infer: does not build.
const _branded3 = brand(0);

// @ts-expect-error Non-branded type does not build.
const _branded4: number = brand(0);

// Erased
interface E4 extends ErasedType<"4"> {}
interface E5 extends ErasedType<"5"> {}
export type T4 = Brand<{ test: number }, E4>;
export type T5 = Brand<{ test: number }, E5>;

// Check strong typing
type _check1 = requireFalse<isAssignableTo<E4, E5>> | requireFalse<isAssignableTo<T4, T5>>;

// brandConst
{
	const constant = brandConst(42)<T1>();
	allowUnused<requireTrue<areSafelyAssignable<typeof constant, 42 & T1>>>();

	// @ts-expect-error incompatible constant value
	const invalidConstant = brandConst("x")<T1>();
}

// strictEnum
{
	const TestA = strictEnum("TestA", {
		a: 1,
		b: 2,
	});
	type TestA = Values<typeof TestA>;

	const TestB = strictEnum("TestB", {
		a: 1,
		b: 2,
	});
	type TestB = Values<typeof TestB>;

	const TestC = strictEnum("TestC", {
		a: 1,
		x: "x",
	});
	type TestC = Values<typeof TestC>;

	allowUnused<requireAssignableTo<TestA, number>>();
	allowUnused<requireFalse<isAssignableTo<TestA, TestB>>>();
	allowUnused<requireFalse<isAssignableTo<typeof TestA.a, typeof TestB.a>>>();
	allowUnused<requireFalse<isAssignableTo<1, typeof TestB.a>>>();
	allowUnused<requireAssignableTo<typeof TestA.a, 1>>();

	// Switch using the actual constants works fine
	// eslint-disable-next-line no-inner-declarations
	function switchLiterals(x: TestA) {
		switch (x) {
			case 1: {
				return "a";
			}
			case 2: {
				return "b";
			}
			default: {
				unreachableCase(x);
			}
		}
	}

	// Switch using the enum members does not narrow without unbrand
	// eslint-disable-next-line no-inner-declarations
	function switchConstants(x: TestA) {
		switch (x) {
			case TestA.a: {
				return "a";
			}
			case TestA.b: {
				return "b";
			}
			default: {
				// @ts-expect-error - should be unreachable, but narrowing fails without using `unbrand`
				unreachableCase(x);
			}
		}
	}

	// Switch using the enum members does narrow with unbrand
	// eslint-disable-next-line no-inner-declarations
	function switchUnbrand(x: TestA) {
		switch (x) {
			case unbrand(TestA.a): {
				return "a";
			}
			case unbrand(TestA.b): {
				return "b";
			}
			default: {
				unreachableCase(x);
			}
		}
	}
}
