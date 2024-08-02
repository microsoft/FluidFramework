/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const record = { a: 1, b: 2 };
const recordA = record.a; // This will not report an error
const recordB = record.b; // This will not report an error

type SomeObj = { [key: string]: string };
const someObj: SomeObj = { a: "hello", b: "goodbye" };
someObj.a; // This will report an error
someObj.a.length; // This will report 2 errors because a is undefined and length on the undefined value is not allowed

interface NestedIndexProps {
	nested: {
		[key: string]: string;
	};
}
const nestedObj: NestedIndexProps = { nested: { a: "hello" } };
nestedObj.nested.a; // This should report an error
nestedObj.nested.a.length; // This should report an error

type StaticType = { a: string; b: string };
type DynamicType = { [key: string]: string };

const someObjWithStaticType: StaticType = { a: "hello", b: "goodbye" };
someObjWithStaticType.a; // This will not report an error
someObjWithStaticType.a.length; // This should not report an error because length exists on strings

const someObjWithDynamicType: DynamicType = someObjWithStaticType;
someObjWithDynamicType.a; // This will report an error
someObjWithDynamicType.a.length; // This will report an error
