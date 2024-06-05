/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { treeDataObjectInternal } from "@fluid-experimental/tree-react-api/internal";

import { treeConfiguration } from "./schema.js";

export const InventoryListFactory = treeDataObjectInternal("tree", treeConfiguration).factory;
