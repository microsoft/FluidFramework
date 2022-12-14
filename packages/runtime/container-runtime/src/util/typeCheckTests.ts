/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// These tests include making sure some banned types (like `{}`) work correctly,
// and are authored with awareness of the issues with these types.

/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable @typescript-eslint/no-extraneous-class */

import {
    MakeNominal,
    Covariant,
    Contravariant,
    Bivariant,
    Invariant,
    requireTrue,
    requireFalse,
    isAssignableTo,
    areSafelyAssignable,
    isAny,
    eitherIsAny,
    isStrictSubset,
} from "./typeCheck";

/**
 * Checks that typeCheck's constraints work as intended.
 * Since typescript does type erasure, these tests have to be compile time checks.
 */

declare class Empty1 {}
declare class Empty2 {}

declare class Nominal1 {
    protected _typeCheck?: MakeNominal;
}

declare class Nominal2 {
    protected _typeCheck?: MakeNominal;
}

declare class Derived1 extends Nominal1 {
    protected _typeCheck?: MakeNominal;
}

declare class Derived2 extends Nominal1 {
    protected _typeCheck?: MakeNominal;
}

declare class Generic<_T> {}

declare class GenericCovariant<T> {
    protected _typeCheck?: Covariant<T>;
}

declare class GenericContravariant<T> {
    protected _typeCheck?: Contravariant<T>;
}

declare class GenericBivariant<T> {
    protected _typeCheck?: Bivariant<T>;
}

declare class GenericInvariant<T> {
    protected _typeCheck?: Invariant<T>;
}

declare class GenericMulti<T, K> {
    protected _typeCheck?: Invariant<T> & Covariant<K>;
}

interface GenericCovariantInterface<T> {
    _typeCheck?: Covariant<T>;
}

interface GenericContravariantInterface<T> {
    _typeCheck?: Contravariant<T>;
}

interface GenericBivariantInterface<T> {
    _typeCheck?: Bivariant<T>;
}

interface GenericInvariantInterface<T> {
    _typeCheck?: Invariant<T>;
}

// Check that interface can be implemented without needing extra members
declare class GenericInvariantImplementation<T> implements GenericInvariantInterface<T> {}

/**
 * Import this into a context where you want to be sure the TypeCheck library is functioning properly.
 *
 * It's functionality depends on compiler settings (requires several of the strict options),
 * and could break with compiler version changes.
 * Thus for maximal confidence everything is working correctly, you need to import this.
 */
export type EnforceTypeCheckTests =
    // Add dummy use of type checking types above
    | requireTrue<
          isAssignableTo<GenericInvariantImplementation<number>, GenericInvariantInterface<number>>
      >

    // Positive tests
    | requireTrue<true>
    | requireFalse<false>

    // test isAssignableTo for normal types
    | requireTrue<isAssignableTo<Empty1, Empty1>>
    | requireTrue<isAssignableTo<Empty1, Empty2>>
    | requireTrue<isAssignableTo<Nominal1, Nominal1>>
    | requireFalse<isAssignableTo<Nominal1, Nominal2>>
    | requireTrue<isAssignableTo<Derived1, Nominal1>>
    | requireFalse<isAssignableTo<Derived1, Derived2>>
    | requireTrue<isAssignableTo<Generic<Nominal1>, Generic<Nominal2>>>

    // test isAssignableTo for any
    | requireTrue<isAssignableTo<any, Nominal1>>
    | requireTrue<isAssignableTo<Nominal1, any>>

    // test isAssignableTo for unknown: all types are assignable to unknown
    | requireFalse<isAssignableTo<unknown, Nominal1>>
    | requireTrue<isAssignableTo<Nominal1, unknown>>

    // test isAssignableTo for never: all types are assignable from never
    | requireTrue<isAssignableTo<never, Nominal1>>
    | requireFalse<isAssignableTo<Nominal1, never>>

    // test Covariant
    | requireFalse<isAssignableTo<GenericCovariant<Nominal1>, GenericCovariant<Nominal2>>>
    | requireTrue<isAssignableTo<GenericCovariant<Derived1>, GenericCovariant<Nominal1>>>
    | requireFalse<isAssignableTo<GenericCovariant<Nominal1>, GenericCovariant<Derived1>>>

    // test Contravariant
    | requireFalse<isAssignableTo<GenericContravariant<Nominal1>, GenericContravariant<Nominal2>>>
    | requireFalse<isAssignableTo<GenericContravariant<Derived1>, GenericContravariant<Nominal1>>>
    | requireTrue<isAssignableTo<GenericContravariant<Nominal1>, GenericContravariant<Derived1>>>

    // test Bivariant
    | requireFalse<isAssignableTo<GenericBivariant<Nominal1>, GenericBivariant<Nominal2>>>
    | requireTrue<isAssignableTo<GenericBivariant<Derived1>, GenericBivariant<Nominal1>>>
    | requireTrue<isAssignableTo<GenericBivariant<Nominal1>, GenericBivariant<Derived1>>>

    // test Invariant
    | requireFalse<isAssignableTo<GenericInvariant<Nominal1>, GenericInvariant<Nominal2>>>
    | requireFalse<isAssignableTo<GenericInvariant<Derived1>, GenericInvariant<Nominal1>>>
    | requireFalse<isAssignableTo<GenericInvariant<Nominal1>, GenericInvariant<Derived1>>>

    // test Multiple parameters
    | requireFalse<isAssignableTo<GenericMulti<Nominal1, number>, GenericMulti<Derived1, number>>>
    | requireFalse<isAssignableTo<GenericMulti<number, Nominal1>, GenericMulti<number, Derived1>>>
    | requireTrue<isAssignableTo<GenericMulti<number, Derived1>, GenericMulti<number, Nominal1>>>

    // test Covariant Interface
    | requireFalse<
          isAssignableTo<GenericCovariantInterface<Nominal1>, GenericCovariantInterface<Nominal2>>
      >
    | requireTrue<
          isAssignableTo<GenericCovariantInterface<Derived1>, GenericCovariantInterface<Nominal1>>
      >
    | requireFalse<
          isAssignableTo<GenericCovariantInterface<Nominal1>, GenericCovariantInterface<Derived1>>
      >

    // test Contravariant Interface
    | requireFalse<
          isAssignableTo<
              GenericContravariantInterface<Nominal1>,
              GenericContravariantInterface<Nominal2>
          >
      >
    | requireFalse<
          isAssignableTo<
              GenericContravariantInterface<Derived1>,
              GenericContravariantInterface<Nominal1>
          >
      >
    | requireTrue<
          isAssignableTo<
              GenericContravariantInterface<Nominal1>,
              GenericContravariantInterface<Derived1>
          >
      >

    // test Bivariant Interface
    | requireFalse<
          isAssignableTo<GenericBivariantInterface<Nominal1>, GenericBivariantInterface<Nominal2>>
      >
    | requireTrue<
          isAssignableTo<GenericBivariantInterface<Derived1>, GenericBivariantInterface<Nominal1>>
      >
    | requireTrue<
          isAssignableTo<GenericBivariantInterface<Nominal1>, GenericBivariantInterface<Derived1>>
      >

    // test Invariant Interface
    | requireFalse<
          isAssignableTo<GenericInvariantInterface<Nominal1>, GenericInvariantInterface<Nominal2>>
      >
    | requireFalse<
          isAssignableTo<GenericInvariantInterface<Derived1>, GenericInvariantInterface<Nominal1>>
      >
    | requireFalse<
          isAssignableTo<GenericInvariantInterface<Nominal1>, GenericInvariantInterface<Derived1>>
      >

    // test eitherIsAny
    | requireTrue<eitherIsAny<any, Nominal1>>
    | requireTrue<eitherIsAny<Nominal1, any>>
    | requireTrue<eitherIsAny<any, any>>
    | requireFalse<eitherIsAny<Nominal1, Nominal1>>

    // areSafelyAssignable tests
    | requireTrue<areSafelyAssignable<Nominal1, Nominal1>>
    | requireFalse<areSafelyAssignable<unknown, Nominal1>>
    | requireFalse<areSafelyAssignable<any, any>>
    | requireTrue<areSafelyAssignable<unknown, unknown>>
    | requireFalse<areSafelyAssignable<any, Nominal1>>
    | requireFalse<areSafelyAssignable<Nominal1, any>>
    | requireFalse<areSafelyAssignable<unknown, any>>

    // test isAny
    | requireTrue<isAny<any>>
    | requireFalse<isAny<unknown>>
    | requireFalse<isAny<Nominal1>>
    | requireFalse<isAny<never>>
    | requireFalse<isAny<{}>>
    | requireFalse<isAny<boolean>>

    // test isStrictSubset
    | requireTrue<isStrictSubset<1, 1 | 2>>
    | requireTrue<isStrictSubset<[1, true], [1 | 2, true]>>
    | requireTrue<isStrictSubset<[1, true], [1 | 2, true | false]>>
    | requireTrue<isStrictSubset<[1, true], [1, true | false]>>
    | requireTrue<isStrictSubset<[1, true], [1, true] | [1 | false]>>
    | requireFalse<isStrictSubset<1, 1>>
    | requireFalse<isStrictSubset<1, 2>>
    | requireFalse<isStrictSubset<[1, true], [1, true]>>
    | requireFalse<isStrictSubset<1 | 2, 1>>;

// negative tests (should not build: enable these to check that tests are actually working)
// type _falseIsTrue = requireTrue<false>;
// type _trueIsFalse = requireFalse<true>;
// type _emptyNotAssignable = requireFalse<isAssignableTo<Empty1, Empty2>>;
// type _numberAssignableToString = requireTrue<isAssignableTo<number, string>>;
// type _anyNotAny = requireFalse<isAny<any>>;
