/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const record = { a: 1, b: 2 };
const recordA = record.a; // This will not report an error
const recordB = record.b; // This will not report an error

interface NestedIndexProps {
	nested: {
		[key: string]: string;
	};
}
const nestedObj: NestedIndexProps = { nested: { a: "hello" } };
nestedObj.nested.a; // This should not report an error, it should be undefined
nestedObj.nested.a.length; // This should report an error

type StaticType = { a: string; b: string };
type DynamicType = { [key: string]: string };

const someObjWithStaticType: StaticType = { a: "hello", b: "goodbye" };
someObjWithStaticType.a; // This will not report an error
someObjWithStaticType.a.length; // This should not report an error because length exists on strings

const someObjWithDynamicType: DynamicType = someObjWithStaticType;
someObjWithDynamicType.a; // This should not report an error, it should be undefined
someObjWithDynamicType.a.length; // This will report an error
if (someObjWithDynamicType.a) {
	someObjWithDynamicType.a.length; // This should not report an error because its inside a truthy check
}
