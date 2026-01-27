/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { treeDataObjectInternal } from "@fluidframework/react/internal";

import { TextAsTree, treeConfiguration } from "./schema.js";

export const TextEditorFactory = treeDataObjectInternal(treeConfiguration, () =>
	TextAsTree.Tree.fromString(""),
).factory;
