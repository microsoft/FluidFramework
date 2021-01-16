/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalServerTestDriver } from "./localServerTestDriver";
import { OdspTestDriver } from "./odspTestDriver";
import { RouterliciousTestDriver } from "./routerliciousTestDriver";
import { TinyliciousTestDriver } from "./tinyliciousTestDriver";

export type TestDriver =
    LocalServerTestDriver
    | TinyliciousTestDriver
    | RouterliciousTestDriver
    | OdspTestDriver;

export * from "./interfaces";
export * from "./localServerTestDriver";
export * from "./odspTestDriver";
export * from "./tinyliciousTestDriver";
export * from "./routerliciousTestDriver";
