/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Array Access Tests
 */

/* Basic array access */
const numberArray = [1, 2, 3];
const stringArray = ["a", "b", "c"];
const mixedArray = [1, "b", true];

// Direct index access
const firstNumber = numberArray[0]; // ok: Accessing array with numeric literal
const lastString = stringArray[2]; // ok: Accessing array with numeric literal
const middleMixed = mixedArray[1]; // ok: Accessing array with numeric literal

// Variable index access
const index = 1;
const numberByVar = numberArray[index]; // ok: Accessing array with numeric variable
const stringByVar = stringArray[index]; // ok: Accessing array with numeric variable

/* Readonly arrays */
const readonlyArray: ReadonlyArray<number> = [1, 2, 3];
const readonlyFirst = readonlyArray[0]; // ok: Accessing readonly array
const readonlyByVar = readonlyArray[index]; // ok: Accessing readonly array with variable

/* Tuple types */
const tuple: [string, number, boolean] = ["hello", 42, true];
const tupleFirst = tuple[0]; // ok: Accessing tuple element
const tupleSecond = tuple[1]; // ok: Accessing tuple element
const tupleByVar = tuple[index]; // ok: Accessing tuple with variable

/* Array-like objects */
const arrayLike = {
    length: 3,
    0: "zero",
    1: "one",
    2: "two"
};
const arrayLikeFirst = arrayLike[0]; // ok: Accessing array-like object with numeric index

/* Array methods that return arrays */
const slicedArray = numberArray.slice(1); // Creates new array
const slicedElement = slicedArray[0]; // ok: Accessing sliced array

/* Nested arrays */
const nested = [[1, 2], [3, 4]];
const nestedElement = nested[0][1]; // ok: Accessing nested array
const nestedByVar = nested[index][index]; // ok: Accessing nested array with variables

/* Array with optional elements */
const sparseArray: (number | undefined)[] = [1, undefined, 3];
const sparseElement = sparseArray[1]; // ok: Accessing potentially undefined element

/* Array destructuring */
const [first, second] = numberArray; // ok: Array destructuring

/* Array access with expressions */
const expressionIndex = 1 + 1;
const elementByExpression = numberArray[expressionIndex]; // ok: Accessing with expression
const elementByComputation = numberArray[index + 1]; // ok: Accessing with computation

/* TypedArray access */
const typedArray = new Int32Array([1, 2, 3]);
const typedElement = typedArray[0]; // ok: Accessing typed array

/* Array subclass */
class CustomArray extends Array<number> {}
const customArray = new CustomArray(1, 2, 3);
const customElement = customArray[0]; // ok: Accessing custom array subclass

/* Generic array types */
function accessGenericArray<T>(arr: T[], index: number): T {
    return arr[index]; // ok: Accessing generic array
}

/* String access (string is array-like) */
const str = "hello";
const char = str[0]; // ok: Accessing string character

/* Array-like DOM collections */
const htmlCollection = document.getElementsByTagName("div");
const firstElement = htmlCollection[0]; // ok: Accessing HTML collection

/* Iterator-based access */
for (let i = 0; i < numberArray.length; i++) {
    const element = numberArray[i]; // ok: Accessing in loop
}

/* Array with union type */
const unionArray: (string | number)[] = ["a", 1, "b", 2];
const unionElement = unionArray[0]; // ok: Accessing union type array

/* Readonly tuple */
const readonlyTuple: readonly [number, string] = [1, "two"];
const readonlyTupleElement = readonlyTuple[0]; // ok: Accessing readonly tuple
