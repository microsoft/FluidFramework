/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 */
export declare type A = number;
/**
 * @public
 */
// eslint-disable-next-line one-var -- intentional; we're testing this case
export declare const a: number, b: string;
/**
 * @internal
 */
export declare const c: number;

import * as InternalTypes from "./innerFile.js";
export { InternalTypes };

/**
 * @sealed
 */
export declare type Sealed = number;

/**
 * @input
 */
export declare type Input = number;
