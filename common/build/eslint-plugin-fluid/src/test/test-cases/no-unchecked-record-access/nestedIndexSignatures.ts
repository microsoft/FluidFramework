/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Nested index signature
 */

interface NestedIndexProps {
	nested: {
		[key: string]: string;
	};
}
/* Nested Index Signatures */
const nestedObj: NestedIndexProps = { nested: { a: "hello" } };
nestedObj.nested.a; // ok: Accessing nested index property 'a' without requiring a particular result
nestedObj.nested.a.length; // defect: Accessing length of a nested possibly undefined or missing property
