/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debugAssert, assert } from "@fluidframework/core-utils/internal";

// TODO: ideally there would be a unit test which actually checks that this is omitted from production builds.
// For now it can be manually verified in ../dist/debugAssert.js,
// and any regression breaking it will show up as a bundle size regression.
debugAssert(() => "This should be removed in production 1");
assert(true, "This should be kept 1", () => "This should be removed in production 2");
// To ensure the bundle being inspected actually contains the correct content,
// use a different string constant in a way that will not be removed so it can be checked for in the bundle.
throw new Error("This should be kept 2");
