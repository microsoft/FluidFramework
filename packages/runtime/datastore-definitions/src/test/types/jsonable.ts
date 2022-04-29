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

// text complex indexed interface
declare const a3: { [key: string]: Jsonable<string> };
foo(a3);

// test interface with multiple properties
interface A5 {
    a: "a",
    b: "b",
}
declare const a5: A5;
foo(a5);

// test interface with optional property
interface A6 {
    a?: "a",
}
declare const a6: A6;
foo(a6);

// test simple type
interface A7 {
    a: "a",
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

// --- should not work

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
    foo?: () => void,
}
declare const a12: A12;
// @ts-expect-error should not be jsonable
foo(a12);

// test type with method
interface A13 {
    foo: () => void,
}
declare const a13: A13;
// @ts-expect-error should not be jsonable
foo(a13);

// test type with primative and object with classes union
interface IA14 {
    a: number | Date;
}
declare const a14: IA14;
// @ts-expect-error should not be jsonable
foo(a14);

// test class with function
class bar {
    public baz() {
    }
}
// @ts-expect-error should not be jsonable
foo(new bar());

// test class with complex property
interface MapProp{
    m: Map<string, string>
}
const mt: MapProp = {
    m: new Map(),
};
// @ts-expect-error should not be jsonable
foo(mt);

// test nested interface with complex property
interface NestedMapProp{
    n: MapProp;
}
const nmt: NestedMapProp = {
    n: mt,
};
// @ts-expect-error should not be jsonable
foo(nmt);

// test class with symbol indexer for property
const sym = Symbol.for("test");
interface ISymbol{
    [sym]: string,
}
const isym: ISymbol = {
    [sym]: "foo",
};
// @ts-expect-error should not be jsonable
foo(isym);
