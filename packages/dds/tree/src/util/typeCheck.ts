/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Normally we would put tests in the test directory.
// However in this case,
// its important that the tests are run with the same compiler settings this library is being used with,
// since this library does not work for some configurations (ex: with strictNullChecks disabled).
// Since the tests don't generate any JS: they only produce types,
// importing them here gets us the validation of the compiler settings we want, with no JS size overhead.
export type { EnforceTypeCheckTests } from "./typeCheckTests";

/**
 * Utilities for manipulating the typescript typechecker.
 *
 * Note: much of this library (the variance parts)
 * will be able to be replaced with Typescript 4.7 explicit variance annotations.
 *
 * Typescript uses structural typing if there are no private or protected members,
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
 * Classes in typescript by default allow all assignments:
 * its only though adding members that any type constraints actually get applied.
 * This library provides types that can be used on a protected member of a class to add the desired constraints.
 *
 * Typical usages (use one field like this at the top of a class):
 * ```
 * protected _typeCheck?: MakeNominal;
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
 * ```
 * protected _typeCheck?: MakeNominal;
 * ```
 *
 * See: {@link https://dev.azure.com/intentional/intent/_wiki/wikis/NP%20Platform/7146/Nominal-vs-Structural-Types}
 *
 * @public
 */
export interface MakeNominal { }

/**
 * Constrain generic type parameters to Contravariant.
 *
 * ```
 * protected _typeCheck?: Contravariant<T>;
 * ```
 *
 * @public
 */
export interface Contravariant<T> {
	_removeCovariance?: (_: T) => void;
}

/**
 * Constrain generic type parameters to Covariant.
 *
 * ```
 * protected _typeCheck?: Covariant<T>;
 * ```
 *
 * @public
 */
export interface Covariant<T> {
	_removeContravariance?: T;
}

/**
 * Constrain generic type parameters to Bivariant.
 * Unused Generic type parameters don't constrain a type at all:
 * Adding Bivariant does the most minimal constraint:
 * it only prevents assignment between types when neither of the two Ts extends the
 * other.
 *
 * ```
 * protected _typeCheck?: Bivariant<T>;
 * ```
 *
 * @public
 */
export interface Bivariant<T> {
	/**
	 * See {@link Bivariant}
	 */
	_constrainToBivariant?(_: T): void;
}

/**
 * Constrain generic type parameters to Invariant.
 *
 * ```
 * protected _typeCheck?: Invariant<T>;
 * ```
 *
 * @public
 */
export interface Invariant<T> extends Contravariant<T>, Covariant<T> { }

/**
 * Compile time assert that X is True.
 * To use, simply define a type:
 * `type _check = requireTrue<your type check>;`
 *
 * @public
 */
export type requireTrue<_X extends true> = true;

/**
 * Compile time assert that X is False.
 * To use, simply define a type:
 * `type _check = requireFalse<your type check>;`
 *
 * @public
 */
export type requireFalse<_X extends false> = true;

/**
 * Returns a type parameter that is true iff Source is assignable to Destination.
 *
 * @public
 */
export type isAssignableTo<Source, Destination> = isAny<Source> extends true
	? true
	: Source extends Destination
	? true
	: false;

/**
 * Returns a type parameter that is true iff Subset is a strict subset of Superset.
 *
 * @public
 */
export type isStrictSubset<Subset, Superset> = isAssignableTo<Subset, Superset> extends false
	? false
	: isAssignableTo<Superset, Subset> extends true
	? false
	: true;

/**
 * Returns a type parameter that is true iff A and B are assignable to each other, and neither is any.
 * This is useful for checking if the output of a type meta-function is the expected type.
 *
 * @public
 */
export type areSafelyAssignable<A, B> = eitherIsAny<A, B> extends true
	? false
	: isAssignableTo<A, B> extends true
	? isAssignableTo<B, A>
	: false;

/**
 * Returns a type parameter that is true iff A is any or B is any.
 *
 * @public
 */
export type eitherIsAny<A, B> = true extends isAny<A> | isAny<B> ? true : false;

/**
 * Returns a type parameter that is true iff T is any.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type isAny<T> = boolean extends (T extends {} ? true : false) ? true : false;
