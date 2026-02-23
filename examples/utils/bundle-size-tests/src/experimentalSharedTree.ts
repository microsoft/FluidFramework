/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import-x/no-deprecated -- This bundle-size test intentionally uses the deprecated SharedTree value. */
import { SharedTree } from "@fluid-experimental/tree";

export function apisToBundle(): typeof SharedTree {
	return SharedTree;
}
