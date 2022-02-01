/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ICommand } from "./command";
export { Dom } from "./dom";
export { randomId } from "./random";
export { getSegmentRange } from "./segment";
export { areStringsEquivalent } from "./string";
export { findToken, TokenList } from "./tokenlist";

export const done = Promise.resolve();
export const emptyObject = Object.freeze({});
export const emptyArray = Object.freeze([] as any[]);

export const clamp = (min: number, value: number, max: number) => Math.min(Math.max(min, value), max);
