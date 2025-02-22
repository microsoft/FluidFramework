/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Normally we would put tests in the test directory.
// However in this case,
// it's important that the tests are run with the same compiler settings this library is being used with,
// since this library does not work for some configurations (ex: with strictNullChecks disabled).
// Since the tests don't generate any JS: they only produce types,
// importing them here gets us the validation of the compiler settings we want, with no JS size overhead.
export type { EnforceTypeCheckTests } from "./typeCheckTests.js";

/**
 * Utilities for manipulating the typescript typechecker.
 *
 * @remarks
 * While it appears the the variance parts of this library are made obsolete by TypeScript 4.7's explicit variance annotations,
 * many cases still type check with incorrect variance even when using the explicit annotations,
 * and are fixed by using the patterns in this library.
 *
 * TypeScript uses structural typing if there are no private or protected members,
 * and variance of generic type parameters depends on their usages.
 * Thus when trying to constrain code by adding extra type information,
 * it often fails to actually constrain as desired, and these utilities can help with those cases.
 *
 * This library is designed so that the desired variance can be documented in a way that is easy to read, concise,
 * and allows easy navigation to documentation explaining what is being done
 * for readers who are not familiar with this library.
 * Additionally it constrains the types so the undesired usage patterns will not compile,
 * and will give somewhat intelligible errors.
 *
 * Additionally this library provides the tools needed to test that the type constraints are working as expected,
 * or test any other similar typing constraints in an application.
 *
 * This library assumes you are compiling with --strictFunctionTypes:
 * (Covariance and Contravariance is explained along with how these helpers cause it in typescript at this link)
 * {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-6.html#strict-function-types}.
 * If compiled with a TypeScript configuration that is not strict enough for these features to work,
 * the test suite should fail to build.
 *
 * Classes in TypeScript by default allow all assignments:
 * its only though adding members that any type constraints actually get applied.
 * This library provides types that can be used on a protected member of a class to add the desired constraints.
 *
 * Typical usages (use one field like this at the top of a class):
 * ```typescript
 * protected _typeCheck!: MakeNominal;
 * protected _typeCheck?: Contravariant<T>;
 * protected _typeCheck?: Covariant<T>;
 * protected _typeCheck?: Invariant<T>;
 * protected _typeCheck?: Contravariant<T> & Invariant<K>;
 * ```
 *
 * See tests for examples.
 *
 * Note that all of these cause nominal typing.
 * If constraints on generic type parameter variance are desired, but nominal typing is not,
 * these types can be used on a public field. This case also works with interfaces.
 *
 * Be aware that other members of your type might apply further constraints
 * (ex: you might try and write a Contravariant<T> class, but it ends up being Invariant<T> due to a field of type T).
 *
 * Be aware of TypeScript Bug:
 * {@link https://github.com/microsoft/TypeScript/issues/36906}.
 * This bug is why the fields here are protected not private.
 * Note that this bug is closed as a duplicate of {@link https://github.com/microsoft/TypeScript/issues/20979}
 * which was closed because fixing it would be too large of a breaking change.
 * Thus we expect this bug to be part of TypeScript for the forseeable future.
 */

/**
 * Use this as the type of a protected field to cause a type to use nominal typing instead of structural.
 *
 * @remarks
 * Using nominal typing in this way prevents assignment of objects which are not instances of this class to values of this class's type.
 * Classes which are used with "instanceof", or are supposed to be instantiated in particular ways (not just made with object literals)
 * can use this to prevent undesired assignments.
 * @example
 * ```typescript
 * protected _typeCheck!: MakeNominal;
 * ```
 * @privateRemarks
 * See: {@link https://dev.azure.com/intentional/intent/_wiki/wikis/NP%20Platform/7146/Nominal-vs-Structural-Types}
 * @sealed @public
 */
export interface MakeNominal {}

/**
 * Constrain generic type parameters to Contravariant.
 *
 * @example
 *
 * ```typescript
 * protected _typeCheck?: Contravariant<T>;
 * ```
 */
export interface Contravariant<in T> {
	_removeCovariance?: (_: T) => void;
}

/**
 * Constrain generic type parameters to Covariant.
 *
 * @example
 *
 * ```typescript
 * protected _typeCheck?: Covariant<T>;
 * ```
 */
export interface Covariant<out T> {
	_removeContravariance?: T;
}

/**
 * Constrain generic type parameters to Invariant.
 *
 * @example
 *
 * ```typescript
 * protected _typeCheck?: Invariant<T>;
 * ```
 */
export interface Invariant<in out T> extends Contravariant<T>, Covariant<T> {}

/**
 * Compile time assert that X is True.
 * To use, simply define a type:
 * `type _check = requireTrue<your type check>;`
 */
export type requireTrue<_X extends true> = true;

/**
 * Compile time assert that X is False.
 * To use, simply define a type:
 * `type _check = requireFalse<your type check>;`
 */
export type requireFalse<_X extends false> = true;

/**
 * Returns a type parameter that is true iff Source is assignable to Destination.
 *
 * @privateRemarks
 * Use of [] in the extends clause prevents unions from being distributed over this conditional and returning `boolean` in some cases.
 * @see {@link https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types | distributive-conditional-types} for details.
 */
export type isAssignableTo<Source, Destination> = [Source] extends [Destination]
	? true
	: false;

/**
 * Returns a type parameter that is true iff Subset is a strict subset of Superset.
 */
export type isStrictSubset<Subset, Superset> = isAssignableTo<Subset, Superset> extends false
	? false
	: isAssignableTo<Superset, Subset> extends true
		? false
		: true;

/**
 * Returns a type parameter that is true iff A and B are assignable to each other, and neither is any.
 * This is useful for checking if the output of a type meta-function is the expected type.
 */
export type areSafelyAssignable<A, B> = eitherIsAny<A, B> extends true
	? false
	: isAssignableTo<A, B> extends true
		? isAssignableTo<B, A>
		: false;

/**
 * Returns a type parameter that is true iff A is any or B is any.
 */
export type eitherIsAny<A, B> = true extends isAny<A> | isAny<B> ? true : false;

/**
 * Returns a type parameter that is true iff T is any.
 *
 * @privateRemarks
 * Only `never` is assignable to `never` (`any` isn't),
 * but `any` distributes over the `extends` here while nothing else should.
 * This can be used to detect `any`.
 */
export type isAny<T> = boolean extends (T extends never ? true : false) ? true : false;

/**
 * Compile time assert that A is assignable to (extends) B.
 * To use, simply define a type:
 * `type _check = requireAssignableTo<T, Expected>;`
 */
export type requireAssignableTo<_A extends B, B> = true;

/**
 * Returns a type parameter that is true iff the `Keys` union includes all the keys of `T`.
 *
 * @remarks
 * This does not handle when the T has an index signature permitting keys like `string` which
 * TypeScript cannot omit members from.
 *
 * @example
 * ```ts
 * type _check = requireTrue<areOnlyKeys<{a: number, b: number}, 'a' | 'b'>> // true`
 * type _check = requireTrue<areOnlyKeys<{a: number, b: number}, 'a'>> // false`
 * ```
 */
export type areOnlyKeys<T, Keys extends keyof T> = isAssignableTo<
	Record<string, never>,
	Omit<Required<T>, Keys>
>;
