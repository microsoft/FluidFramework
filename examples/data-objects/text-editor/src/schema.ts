/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeViewConfiguration } from "@fluidframework/tree";
// eslint-disable-next-line import-x/no-internal-modules
export { TextAsTree } from "@fluidframework/tree/internal";
// eslint-disable-next-line import-x/no-internal-modules
import { TextAsTree } from "@fluidframework/tree/internal";

export const treeConfiguration = new TreeViewConfiguration({ schema: TextAsTree.Tree });
