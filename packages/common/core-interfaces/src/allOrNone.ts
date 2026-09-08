/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A type modifier that constrains the keys of `T` to be either all present
 * (with their declared types) or all absent. Mixed shapes — supplying some
 * keys but not others — are rejected at compile time.
 *
 * Use this to express "supply this whole group, or supply none of it" without
 * having to police the constraint at runtime.
 *
 * @example
 * ```ts
 * interface Auth { user: string; token: string }
 * type Props = { url: string } & AllOrNone<Auth>;
 * const a: Props = { url: "x" };                                    // ok
 * const b: Props = { url: "x", user: "u", token: "t" };             // ok
 * const c: Props = { url: "x", user: "u" };                         // error
 * ```
 *
 * @remarks
 * The "all-or-none" shape is a small, general, composable primitive — it
 * shows up wherever a feature is wired up by supplying a group of cooperating
 * objects (driver triples, transport plus credentials, etc.) and is awkward
 * to spell out inline. Naming it lets callers reuse the same pattern and lets
 * reviewers see the intent at the declaration site instead of re-deriving it
 * from a hand-rolled discriminated union. The mapped form
 * `{ [K in keyof T]?: never }` is mechanical, so downstream consumers do not
 * need any unusual TS feature to use it.
 *
 * @legacy @alpha
 */
export type AllOrNone<T> = T | { [K in keyof T]?: never };
