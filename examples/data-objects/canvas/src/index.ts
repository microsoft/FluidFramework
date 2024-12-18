/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { Ink } from "@fluid-experimental/ink";
import { DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import React from "react";

import { Canvas } from "./canvas.js";
import { CanvasView } from "./view.js";

/**
 * @internal
 */
export const CanvasInstantiationFactory = new DataObjectFactory(
	"Canvas",
	Canvas,
	[Ink.getFactory()],
	{},
);

const canvasViewCallback = (canvas: Canvas): React.ReactElement =>
	React.createElement(CanvasView, { canvas });

/**
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory<Canvas>(
	CanvasInstantiationFactory,
	canvasViewCallback,
);
