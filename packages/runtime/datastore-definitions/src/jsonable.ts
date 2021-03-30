/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Take a type, usually an interface and tries to map it to a compatible jsonable type.
 * This is basically taking advantage of duck typing. We are generating a type we know
 * is jsonable from the input type, but setting anything not serializable to never,
 * which will cause compile time issues with objects of the original type if they
 * have properties that are not jsonable.
 *
 * The usage looks like `foo<T>(input: AsJsonable<T>)`
 *
 * if T isn't jsonable then all values of input will be invalid,
 * as all the properties will need to be never which isn't possible.
 *
 * This won't be fool proof, but if someone modifies a type used in an
 * AsJsonable to add a property that isn't Jsonable, they should get a compile time
 * break, which is pretty good.
 *
 * What this type does:
 * If T is Jsonable<J>
 *      return T
 *      Else if f T is not a function,
 *          For each property K of T recursively
 *              if property K is not a symbol
 *                  return AsJsonable of the property
 *                  Else return never
 *          Else return never
 */
 export type Jsonable<T = any, J = void> =
    T extends null | boolean | number | string | J
        ? T
        // eslint-disable-next-line @typescript-eslint/ban-types
        : Extract<T, Function> extends never
            ? {
                [K in keyof T]: Extract<K, symbol> extends never
                    ? Jsonable<T[K], J>
                    : never
            }
            : never;
