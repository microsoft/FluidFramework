/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppState } from "@fluid-example/cross-package-schema-provider";
import { TreeViewConfiguration } from "@fluidframework/tree";

/**
 * This file demonstrates the BROKEN import path. It imports from the "."
 * export (which resolves through .d.ts) instead of the "/schema" subpath
 * (which resolves through .ts source).
 *
 * Run `npm run check:direct-import` to see this failure.
 */

export const appConfig = new TreeViewConfiguration({ schema: AppState });
