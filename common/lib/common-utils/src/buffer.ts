import { bindInstanceOfBuiltin } from "./instanceOf";

/**
 * Determines if an object is an array buffer
 * Will detect and reject TypedArrays, like Uint8Array.
 * Reason - they can be viewport into Array, they can be accepted, but caller has to deal with
 * math properly (i.e. take into account byteOffset at minimum).
 * For example, construction of new TypedArray can be in the form of new TypedArray(typedArray) or
 * new TypedArray(buffer, byteOffset, length), but passing TypedArray will result in fist path (and
 * ignoring byteOffice, length)
 * @param obj - The object to determine if it is an ArrayBuffer
 */
export const isArrayBuffer: (obj: any) => obj is ArrayBuffer = bindInstanceOfBuiltin(new ArrayBuffer(0));
