/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {expectError} from 'tsd';
import { Jsonable, AsJsonable } from '../dist/jsonable';

declare function foo<T>(a: AsJsonable<T>): void;

// --- should work

foo(1);
foo("");
foo(undefined);
foo(null);
foo(true);
foo([]);
foo([0]);
foo([""]);
foo({});
foo({ a:"a" });


interface IA {
    a: "a";
}
declare const a: IA;
foo(a)


interface IA2 {
    ["a"]: "a";
}
declare const a2: IA2;
foo(a2);


declare const a3: { [key: string]: Jsonable<string> };
foo(a3);

interface A5 {
    a: "a",
    b: "b",
};
declare const a5: A5;
foo(a5);

interface A6 {
    a?: "a",
};
declare const a6: A6;
foo(a6);

type A7 = {
    a: "a",
};

declare const a7: A7;
foo(a7);

class Z {
    public a = "a";
}

foo<Z>(new Z())

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
        b2:"foo",
    },
}
foo(nested);

// --- should not work

interface IA11 {
    ["a"]: "a";
    foo: () => void;
}
declare const a11: IA11;
expectError(foo(a11));


interface A12 {
    foo?: () => void,
};
declare const a12: A12;
expectError(foo(a12));


type A13 = {
    foo: () => void,
};
declare const a13: A13;
expectError(foo(a13));


interface IA14 {
    a: number | Date;
}
declare const a14: IA14;
expectError(foo(a14));


class bar {
    public baz() {
    }
}

expectError(foo(new bar()));

interface MapProp{
    m: Map<string,string>
}
const mt: MapProp = {
    m: new Map(),
}
expectError(foo(mt));

interface NestedMapProp{
    n: MapProp;
}
const nmt: NestedMapProp = {
    n: mt,
};
expectError(foo(nmt));