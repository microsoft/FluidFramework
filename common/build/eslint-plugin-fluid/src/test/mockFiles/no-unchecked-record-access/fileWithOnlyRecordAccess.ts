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
type IndexSignatureType = { [key: string]: string };

const nestedObj: NestedIndexProps = { nested: { a: "hello" } };
nestedObj.nested.a; // ok: Accessing nested property 'a', 'a' is defined
nestedObj.nested.a.length; // defect: Accessing length of a nested undefined property

const a = "a";
const b = "b";
const c = "c";
const someObjWithStaticType: StaticType = { a: "hello", b: "goodbye" };
someObjWithStaticType.a; // ok: Accessing property 'a', 'a' is defined
someObjWithStaticType.a.length; // ok: Accessing length of string property 'a', 'a' is a string
someObjWithStaticType["a"]; // ok: Accessing property 'a' using bracket notation
someObjWithStaticType["a"].length; // ok: Accessing length of string property 'a' using bracket notation
someObjWithStaticType[a].length; // ok: Accessing length of string property 'a' using bracket notation
someObjWithStaticType[b].length; // ok: Accessing length of string property 'b' using bracket notation
someObjWithStaticType[c].length; // defect: Accessing length of undefined property 'c' using bracket notation
const aExpectingStringFromStaticType: string = someObjWithStaticType.a; // ok: Assigning string property to a strict string variable, 'a' is defined
const aExpectingStringOrUndefinedFromStaticType: string | undefined = someObjWithStaticType.a; // ok: Assigning string property to a string or undefined variable

const someObjWithPotenciallyUndefinedProperties: IndexSignatureType = someObjWithStaticType;
someObjWithPotenciallyUndefinedProperties.a; // ok: Accessing dynamic property 'a', its type is dynamic
someObjWithPotenciallyUndefinedProperties.a.length; // defect: Accessing length of dynamic property 'a', TypeScript can't guarantee 'a' is a string
someObjWithPotenciallyUndefinedProperties["a"]; // ok: Accessing property 'a' using bracket notation
someObjWithPotenciallyUndefinedProperties["a"].length; // defect: Accessing length of potencially undefined property 'a' using bracket notation
someObjWithPotenciallyUndefinedProperties[a].length; // ok: Accessing length of string property 'a' using bracket notation
someObjWithPotenciallyUndefinedProperties[b].length; // ok: Accessing length of string property 'b' using bracket notation
someObjWithPotenciallyUndefinedProperties[c].length; // defect: Accessing length of undefined property 'c' using bracket notation
someObjWithPotenciallyUndefinedProperties.a?.length; // ok: Using optional chaining to access length, safely handles 'undefined'

if (someObjWithPotenciallyUndefinedProperties.a) {
	someObjWithPotenciallyUndefinedProperties.a.length; // ok: Within a truthy check, 'a' is guaranteed to be defined
}

for (const key in someObjWithPotenciallyUndefinedProperties) {
	someObjWithPotenciallyUndefinedProperties[key]; // ok: Accessing dynamic property using 'in'
	someObjWithPotenciallyUndefinedProperties[key].length; // ok: Accessing dynamic property using 'in'
}

for (const [key, value] of Object.entries(someObjWithPotenciallyUndefinedProperties)) {
	value; // ok: Accessing value from entries
	value.length; // ok: Accessing length of value from entries, entries should be string values
	someObjWithPotenciallyUndefinedProperties[key]; // ok: Accessing dynamic property using 'in'
	someObjWithPotenciallyUndefinedProperties[key].length; // ok: Accessing dynamic property using 'in'
}

const aExpectingString: string = someObjWithPotenciallyUndefinedProperties.a; // defect: Assigning dynamic property to a strict string variable, 'a' might be undefined
const aExpectingStringOrUndefined: string | undefined = someObjWithPotenciallyUndefinedProperties.a; // ok: Assigning dynamic property to a string or undefined variable, 'a' might be undefined
const aImplicitType = someObjWithPotenciallyUndefinedProperties.a; // ok: Assigning dynamic property with inferred type
aImplicitType.length; // defect: Accessing length of inferred type, 'a' might be undefined
aImplicitType?.length; // ok: Optional chaining to access length, safely handles 'undefined'

if ("a" in someObjWithPotenciallyUndefinedProperties) {
	someObjWithPotenciallyUndefinedProperties.a.length; // ok: Accessing length of property inside an 'in' check, 'a' is guaranteed to be defined
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
