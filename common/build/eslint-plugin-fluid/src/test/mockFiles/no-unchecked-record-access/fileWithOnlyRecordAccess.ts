/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const record = { a: 1, b: 2 };
const recordA = record.a; // ok: Accessing property 'a' directly, 'a' is defined
const recordB = record.b; // ok: Accessing property 'b' directly, 'b' is defined

interface NestedIndexProps {
	nested: {
		[key: string]: string;
	};
}
type StaticType = { a: string; b: string };
type DynamicType = { [key: string]: string };

const nestedObj: NestedIndexProps = { nested: { a: "hello" } };
nestedObj.nested.a; // ok: Accessing nested property 'a', 'a' is defined
nestedObj.nested.a.length; // defect: Accessing length of a nested undefined property

const someObjWithStaticType: StaticType = { a: "hello", b: "goodbye" };
someObjWithStaticType.a; // ok: Accessing property 'a', 'a' is defined
someObjWithStaticType.a.length; // ok: Accessing length of string property 'a', 'a' is a string
someObjWithStaticType["a"]; // ok: Accessing property 'a' using bracket notation
someObjWithStaticType["a"].length; // ok: Accessing length of string property 'a' using bracket notation

const someObjWithDynamicType: DynamicType = someObjWithStaticType;
someObjWithDynamicType.a; // ok: Accessing dynamic property 'a', its type is dynamic
someObjWithDynamicType.a.length; // defect: Accessing length of dynamic property 'a', TypeScript can't guarantee 'a' is a string
someObjWithStaticType["a"]; // ok: Accessing property 'a' using bracket notation
someObjWithStaticType["a"].length; // ok: Accessing length of string property 'a' using bracket notation
someObjWithDynamicType.a?.length; // ok: Using optional chaining to access length, safely handles 'undefined'

if (someObjWithDynamicType.a) {
	someObjWithDynamicType.a.length; // ok: Within a truthy check, 'a' is guaranteed to be defined
}

for (const key in someObjWithDynamicType) {
	someObjWithDynamicType[key]; // ok: Accessing dynamic property using 'in'
	someObjWithDynamicType[key].length; // defect: Accessing length of dynamic property, TypeScript can't guarantee the property is a string
}

for (const [key, value] of Object.entries(someObjWithDynamicType)) {
	value; // ok: Accessing value from entries
	value.length; // ok: Accessing length of value from entries, entries should be string values
}

interface NonNullableProps {
	definitelyString: string;
	maybeString?: string;
}

const nonNullObj: NonNullableProps = { definitelyString: "hello" };
nonNullObj.definitelyString.length; // ok: Accessing length of non-nullable property
nonNullObj.maybeString.length; // defect: Accessing length of potentially undefined property
nonNullObj.maybeString!.length; // ok: Non-null assertion, we assert it is not null
nonNullObj.maybeString?.length; // ok: Optional chaining, safely handles 'undefined'

let possiblyUndefined: string | undefined;
possiblyUndefined = nonNullObj.maybeString; // ok: Assigning optional property to variable of type 'string | undefined'

const aExpectingString: string = someObjWithDynamicType.a; // defect: Assigning dynamic property to a strict string variable, 'a' might be undefined
const aImplicitType = someObjWithDynamicType.a; // ok: Assigning dynamic property with inferred type
aImplicitType.length; // defect: Accessing length of inferred type, 'a' might be undefined
aImplicitType?.length; // ok: Optional chaining to access length, safely handles 'undefined'
const aExplicitStringOrUndefined: string | undefined = someObjWithDynamicType.a; // ok: Explicitly defining type as 'string | undefined'

if ("a" in someObjWithDynamicType) {
	someObjWithDynamicType.a.length; // ok: Accessing length of property inside an 'in' check, 'a' is guaranteed to be defined
}
