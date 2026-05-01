/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createOdspServiceClient } from "@fluidframework/odsp-client/alpha";
import { defineTreeDataStore } from "fluid-framework/alpha";

import { connectionConfig } from "./clientProps.js";
import { App, treeConfiguration } from "./schema.js";

export const service = createOdspServiceClient({
	connection: connectionConfig,
	minVersionForCollaboration: "2.0.0",
});

export const appDataStoreKind = defineTreeDataStore({
	type: "shared-tree-demo",
	config: treeConfiguration,
	initializer: () => new App({ letters: [], word: [] }),
});
