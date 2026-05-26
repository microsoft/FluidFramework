/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { getFluidTestMochaConfigWithCompat } from "@fluid-private/test-version-utils/mocharc-common";

const packageDir = path.resolve(import.meta.dirname, "../..");
const config = getFluidTestMochaConfigWithCompat(packageDir);
export default config;
