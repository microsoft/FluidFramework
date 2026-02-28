/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Okay } from "@fluid-example/cross-package-schema-provider";
import { TreeViewConfiguration } from "@fluidframework/tree";

/**
 * This file demonstrates the WORKING import path. It imports from Okay
 * module that has a viable .d.ts file.
 */
export const appConfig = new TreeViewConfiguration({ schema: Okay.AppState });
