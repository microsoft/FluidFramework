/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export { getSegmentRange } from "./segment";

export const done = Promise.resolve();
export const emptyObject = Object.freeze({});
export const emptyArray = Object.freeze([] as any[]);

export const clamp = (min: number, value: number, max: number) => Math.min(Math.max(min, value), max);
