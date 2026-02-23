/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import type { IReactTreeDataObject } from "@fluidframework/react/alpha";
import * as React from "react";

import {
	type TextAsTree,
	TextEditorFactory,
	PlainTextMainView,
	QuillMainView,
	type MainViewProps,
} from "./plain/index.js";

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

/**
 * Create the appropriate Fluid export based on view type.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createFluidExport() {
	return new ContainerViewRuntimeFactory(
		TextEditorFactory,
		(tree: IReactTreeDataObject<typeof TextAsTree.Tree>) => {
			const ViewComponent = getViewComponent();
			return React.createElement(tree.TreeViewComponent, { viewComponent: ViewComponent });
		},
	);
}

export const fluidExport = createFluidExport();
