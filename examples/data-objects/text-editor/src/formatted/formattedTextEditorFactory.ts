/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { treeDataObjectInternal } from "@fluidframework/react/internal";

import { FormattedTextAsTree, formattedTreeConfiguration } from "./formattedSchema.js";

export const FormattedTextEditorFactory = treeDataObjectInternal(
	formattedTreeConfiguration,
	() => FormattedTextAsTree.Tree.fromString(""),
).factory;
