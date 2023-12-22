/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeFactory } from "@fluidframework/tree/esm";

export function apisToBundle() {
	new SharedTreeFactory();
}
