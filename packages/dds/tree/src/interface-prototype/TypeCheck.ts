/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utilities for manipulating the typescript typechecker.
 *
 * Typescript uses structural typing if there are no private or protected members,
 * and variance of generic type parameters depends on their usages.
 * Thus when trying to constrain code by adding extra type information,
 * it often fails to actually constrain as desired, and these utilities can help with those cases.
 *
 * This library assumes you are compiling with --strictFunctionTypes:
 * (Covariance and Contravariance is explained along with how these helpers cause it in typescript at this link)
 * {@link https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-6.html#strict-function-types}
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
 * Be aware of Typescript Bug:
 * {@link https://github.com/microsoft/TypeScript/issues/36906} and #38603
 * This bug is why the fields here are protected not private.
 */

/**
 * Use this as the type of a protected field to cause a type to use nominal typing instead of structural.
 *
 * protected _typeCheck?: MakeNominal;
 *
 * See: {@link https://dev.azure.com/intentional/intent/_wiki/wikis/NP%20Platform/7146/Nominal-vs-Structural-Types}
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class MakeNominal {}

/**
 * Constrain generic type parameters to Contravariant.
 *
 * protected _typeCheck?: Contravariant<T>;
 *
 * @public
 */
export interface Contravariant<T> {
	_removeCovariance?: (_: T) => void;
}

/**
 * Constrain generic type parameters to Covariant.
 *
 * protected _typeCheck?: Covariant<T>;
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
 * protected _typeCheck?: Bivariant<T>;
 *
 * @public
 */
export interface Bivariant<T> {
	_constrainToBivariant?(_: T): void;
}

/**
 * Constrain generic type parameters to Invariant.
 *
 * protected _typeCheck?: Invariant<T>;
 *
 * @public
 */
export interface Invariant<T> extends Contravariant<T>, Covariant<T> {}

/**
 * Compile time assert that X is True
 *
 * @public
 */
export function isTrue<_X extends true>(): void {
	// This function is only used to check if the type parameter is true. It does nothing at runtime.
}

/**
 * Compile time assert that X is False
 *
 * @public
 */
export function isFalse<_X extends false>(): void {
	// This function is only used to check if the type parameter is false. It does nothing at runtime.
}

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
