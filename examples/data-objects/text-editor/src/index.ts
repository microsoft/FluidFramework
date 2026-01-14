/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import type { IReactTreeDataObject } from "@fluidframework/react/alpha";
import * as React from "react";

import type { TextAsTree } from "./schema.js";
import { TextEditorFactory } from "./textEditorFactory.js";
import { MainView } from "./view/index.js";

export const fluidExport = new ContainerViewRuntimeFactory(
	TextEditorFactory,
	(tree: IReactTreeDataObject<typeof TextAsTree.Tree>) =>
		React.createElement(tree.TreeViewComponent, { viewComponent: MainView }),
);
