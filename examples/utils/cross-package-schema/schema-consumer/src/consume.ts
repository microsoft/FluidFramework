/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppState } from "@fluid-example/cross-package-schema-provider/schema";
import { TreeViewConfiguration } from "@fluidframework/tree";

/**
 * This file demonstrates the WORKING import path. It imports from the
 * "/schema" subpath, which resolves types from the provider's .ts source
 * instead of the broken .d.ts files.
 *
 * Run `npm run check:schema-import` to verify this passes.
 */

export const appConfig = new TreeViewConfiguration({ schema: AppState });
