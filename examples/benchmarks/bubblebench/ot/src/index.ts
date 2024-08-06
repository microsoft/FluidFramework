/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AppView } from "@fluid-example/bubblebench-common";
import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { Bubblebench, BubblebenchInstantiationFactory } from "./main.js";
export { Bubblebench, BubblebenchInstantiationFactory } from "./main.js";

const bubblebenchViewCallback = (model: Bubblebench): React.ReactElement =>
	React.createElement(AppView, { app: model.appState });

/**
 * This does setup for the Container. The ContainerViewRuntimeFactory will instantiate a single Fluid object to use
 * as our model (using the factory we provide), and the view callback we provide will pair that model with an
 * appropriate view.
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory(
	BubblebenchInstantiationFactory,
	bubblebenchViewCallback,
);
