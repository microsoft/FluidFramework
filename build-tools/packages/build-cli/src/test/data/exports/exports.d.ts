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
// eslint-disable-next-line unicorn/prefer-export-from -- intentional; we are testing this case
export { InternalTypes };
