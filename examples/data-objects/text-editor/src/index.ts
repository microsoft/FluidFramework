/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import type { IReactTreeDataObject } from "@fluidframework/react/alpha";
import * as React from "react";

import { MainView as PlainTextMainView } from "./plainTextView.js";
import { MainView as QuillMainView, type MainViewProps } from "./quillView.js";
import type { TextAsTree } from "./schema.js";
import { TextEditorFactory } from "./textEditorFactory.js";

/**
 * Injected by webpack DefinePlugin.
 * Set via --env view=quill or --env view=plaintext
 */
declare const __FLUID_VIEW__: "quill" | "plaintext";

/**
 * Get the view component based on webpack build configuration.
 * Set via --env view=quill or --env view=plaintext
 */
function getViewComponent(): React.FC<MainViewProps> {
	if (__FLUID_VIEW__ === "plaintext") {
		return PlainTextMainView;
	}
	return QuillMainView;
}

export const fluidExport = new ContainerViewRuntimeFactory(
	TextEditorFactory,
	(tree: IReactTreeDataObject<typeof TextAsTree.Tree>) => {
		const ViewComponent = getViewComponent();
		return React.createElement(tree.TreeViewComponent, { viewComponent: ViewComponent });
	},
);
