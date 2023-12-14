/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "../..";

declare function foo<T>(jsonable: Jsonable<T>): void;

// --- ideally wouldn't work but do as we don't know how to just exclude classes

// test simple class.
class Z {
	public a = "a";
}

foo<Z>(new Z());

// test class with getter
class getter {
	// The point here is to test a getter
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	public get baz(): number {
		return 0;
	}
}

foo(new getter());

// --- should work

// test plain types
foo(1);
foo("");
foo(undefined);
foo(null);
foo(true);
foo([]);
foo([0]);
foo([""]);
foo({});
foo({ a: "a" });

// test simple interface
interface IA {
	a: "a";
}
declare const a: IA;
foo(a);

// test simple indexed interface
interface IA2 {
	["a"]: "a";
}
declare const a2: IA2;
foo(a2);

// test complex indexed type
declare const a3: { [key: string]: string };
foo(a3);

// test "unknown" cannonical Json content
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
declare const json: Json;
foo(json);

// test "unknown" Jsonable content
declare const unknownJsonable: Jsonable<unknown>;
foo(unknownJsonable);

// test "unknown" cannonical Json content in an interface
interface A4 {
	payload: Json;
}
declare const a4: A4;
foo(a4);

// test interface with multiple properties
interface A5 {
	a: "a";
	b: "b";
}
declare const a5: A5;
foo(a5);

// test interface with optional property
interface A6 {
	a?: "a";
}
declare const a6: A6;
foo(a6);

// test simple type
interface A7 {
	a: "a";
}

declare const a7: A7;
foo(a7);

// test nested interface
interface IBN {
	b2: string;
}

interface INested {
	a: string;
	b: IBN;
}

const nested: INested = {
	a: "a",
	b: {
		b2: "foo",
	},
};
foo(nested);

// test `any` type
declare const anAny: any;
foo(anAny);

// test "recursive" type compiles
// Infinite recursion not supported nor desired but is not prevented
// and this test exists simply to demonstrate that limitation.
interface SelfReferencing {
	me: SelfReferencing;
}
declare const selfReferencing: SelfReferencing;
foo(selfReferencing);

// --- should not work

// test unknown
declare const aUnknown: unknown;
// @ts-expect-error should not be jsonable
foo(aUnknown);

// test interface with unknown
declare const nestedUnknown: { a: unknown };
// @ts-expect-error should not be jsonable
foo(nestedUnknown);

// test interface with method, and member
interface IA11 {
	["a"]: "a";
	foo: () => void;
}
declare const a11: IA11;
// @ts-expect-error should not be jsonable
foo(a11);

// test interface with optional method
interface A12 {
	foo?: () => void;
}
declare const a12: A12;
// @ts-expect-error should not be jsonable
foo(a12);

// test type with method
interface A13 {
	foo: () => void;
}
declare const a13: A13;
// @ts-expect-error should not be jsonable
foo(a13);

// test type with primative and object with classes union
interface IA14 {
	a: number | bar;
}
declare const a14: IA14;
// @ts-expect-error should not be jsonable
foo(a14);

// test class with function
class bar {
	public baz() {}
}
// @ts-expect-error should not be jsonable
foo(new bar());

// test class with complex property
interface MapProp {
	m: Map<string, string>;
}
const mt: MapProp = {
	m: new Map(),
};
// @ts-expect-error should not be jsonable
foo(mt);

// test nested interface with complex property
interface NestedMapProp {
	n: MapProp;
}
const nmt: NestedMapProp = {
	n: mt,
};
// @ts-expect-error should not be jsonable
foo(nmt);

// test class with symbol indexer for property
const sym = Symbol.for("test");
interface ISymbol {
	[sym]: string;
}
const isym: ISymbol = {
	[sym]: "foo",
};
// @ts-expect-error should not be jsonable
foo(isym);

// *disabled* test that array-like types are fully arrays
// Jsonable allows ArrayLike to be an object as base JsonableTypeWith<never>
// uses ArrayLike to avoid TypeOnly type test limitation. If that is addressed
// then this test should be enabled.
declare const mayNotBeArray: ArrayLike<number>;
// @disable ts-expect-error should not be jsonable
foo(mayNotBeArray);

/**
 * TypeAliasOf creates a type equivalent version of an interface.
 * @remarks
 * It is used below to bypass the early "Index signature for type 'string'" issue for interfaces.
 */
type TypeAliasOf<T> = T extends object
	? T extends () => any | null
		? T
		: { [K in keyof T]: TypeAliasOf<T[K]> }
	: T;

// test foo<T>(value: Jsonable<T>) remains an error for troublesome values even when coercing T to `any`
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(aUnknown);
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(nestedUnknown);
declare const a11t: TypeAliasOf<typeof a11>;
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(a11t);
declare const a12t: TypeAliasOf<typeof a12>;
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(a12t);
declare const a13t: TypeAliasOf<typeof a13>;
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(a13t);
declare const a14t: TypeAliasOf<typeof a14>;
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(a14t);
const aBar = new bar();
declare const aBarT: TypeAliasOf<typeof aBar>;
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(aBarT);
declare const anMtT: TypeAliasOf<typeof mt>;
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(anMtT);
declare const anNmtT: TypeAliasOf<typeof nmt>;
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(anNmtT);
// @ts-expect-error unsupported types cannot circumnavigate with Jsonable<any>
foo<any>(isym);

// --- tests that are not part of the Jsonable specification but are included
//  to demonstrate limitations.

// test interfaces passed for Jsonable<unknown> are not assignable
// Typescript makes an allowance for types regarding index signatures but does not for
// interfaces which may be augmented. Test that
//   Index signature for type 'string' is missing in type 'X'. ts(2345)
// occurs for interfaces but not for types.
// See https://github.com/microsoft/TypeScript/issues/15300#issuecomment-657218214
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(a);
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(a2);
// no error for _type_ to Jsonable<unknown>
foo<unknown>(a3);
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(a4);
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(a5);
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(a6);
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(a7);
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(nested);
// no error for any to Jsonable<unknown>
foo<unknown>(anAny);
// @ts-expect-error interfaces are not assignable to Jsonable<unknown>
foo<unknown>(selfReferencing);

// Show that cast to Jsonable version of self (a type alias) does compile
// to be passed to Jsonable<unknown>. This is not a recommended practice.
foo<unknown>(a as Jsonable<typeof a>);
foo<unknown>(a2 as Jsonable<typeof a2>);
foo<unknown>(a3 as Jsonable<typeof a3>);
foo<unknown>(a4 as Jsonable<typeof a4>);
foo<unknown>(a5 as Jsonable<typeof a5>);
foo<unknown>(a6 as Jsonable<typeof a6>);
foo<unknown>(a7 as Jsonable<typeof a7>);
foo<unknown>(nested as Jsonable<typeof nested>);
foo<unknown>(anAny as Jsonable<typeof anAny>);
foo<unknown>(selfReferencing as Jsonable<typeof selfReferencing>);

// Show that cast to Jsonable version of self does compile even if not
// respecting the limitations. This is a dangerous practice, but can
// be useful if very careful.
foo(aUnknown as Jsonable<typeof aUnknown>);
foo(nestedUnknown as Jsonable<typeof nestedUnknown>);
foo(a11 as Jsonable<typeof a11>);
foo(a12 as Jsonable<typeof a12>);
foo(a13 as Jsonable<typeof a13>);
foo(a14 as Jsonable<typeof a14>);
foo(aBar as Jsonable<typeof aBar>);
foo(mt as Jsonable<typeof mt>);
foo(nmt as Jsonable<typeof nmt>);
foo(isym as Jsonable<typeof isym>);
