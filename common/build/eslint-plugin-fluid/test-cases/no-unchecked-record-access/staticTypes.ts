/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Static Types
 * no-unchecked-record-access should not apply to static types, since they are guaranteed to have the properties they define.
 */
/* Constants and Variables */
type StaticType = { a: string; b: string };
const someObjWithStaticType: StaticType = { a: "hello", b: "goodbye" };
const a = "a";
const b = "b";

someObjWithStaticType.a; // ok: Accessing string property 'a'
someObjWithStaticType.a.length; // ok: Accessing length of string property 'a'
someObjWithStaticType["a"]; // ok: Accessing property 'a' using bracket notation
someObjWithStaticType["a"].length; // ok: Accessing length of string property 'a' using bracket notation
someObjWithStaticType[a].length; // ok: Accessing length of string property 'a' using bracket notation
someObjWithStaticType[b].length; // ok: Accessing length of string property 'b' using bracket notation
const aExpectingStringFromStaticType: string = someObjWithStaticType.a; // ok: Assigning string property to a strict string variable
const aExpectingStringOrUndefinedFromStaticType: string | undefined = someObjWithStaticType.a; // ok: Assigning string property to a string or undefined variable

/* Inferred Static Types */
const record = { a: 1, b: 2 };
const recordA = record.a; // ok: Accessing number property 'a' directly
const recordB = record.b; // ok: Accessing number property 'b' directly
