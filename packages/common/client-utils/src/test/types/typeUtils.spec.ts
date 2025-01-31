/* eslint-disable no-void */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
//* Remove

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Mutable, Patch } from "../../typeUtils.js";

interface AllReadonly {
	readonly one: string;
	readonly two: number;
}

interface AllMutable {
	one: string;
	two: number;
}

const x: AllReadonly = { one: "hello", two: 42 };

// Now mutable! (no keys specified)
(x as Mutable<AllReadonly>).one = "goodbye";
(x as Mutable<AllReadonly>).two = 42;
// Specifying keys works (without affecting the other props)
(x as Mutable<AllReadonly, "one">).one = "goodbye";
void (x as Mutable<AllReadonly, "one">).two;
// @ts-expect-error - Cannot assign to 'two' because it is still a read-only property.
(x as Mutable<AllReadonly, "one">).two = 43;

// @ts-expect-error - Cannot assign to 'two' because it is now a read-only property.
(x as Patch<AllMutable, { readonly two: number }>).two = "hello";
// @ts-expect-error - Cannot assign 43 to 'two' because it doesn't match the Patched type
(x as Patch<AllReadonly, { two: 42 }>).two = 43;

class WithPrivate {
	private readonly foo: string = "FOO";
	public bar: number = this.foo.length;
}
const withPrivate = new WithPrivate();

// Useful for accessing private properties for testing
(withPrivate as unknown as Patch<WithPrivate, { foo: string }>).foo = "BAR";

interface CurrentVersion {
	foo: string;
	bar: number;
}

type EarlierVersion = Patch<CurrentVersion, { bar?: undefined }>;
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- Seems to be a bug in eslint
type VersionForRead = CurrentVersion | EarlierVersion;

const input: VersionForRead = { foo: "hello" };
