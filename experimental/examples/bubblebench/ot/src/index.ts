/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import { AppView } from "@fluid-example/bubblebench-common";
import React from "react";

import { Bubblebench, BubblebenchInstantiationFactory } from "./main";
export { Bubblebench, BubblebenchInstantiationFactory } from "./main";

const bubblebenchViewCallback = (model: Bubblebench) => React.createElement(AppView, { app: model.appState });

/**
 * This does setup for the Container. The ContainerViewRuntimeFactory will instantiate a single Fluid object to use
 * as our model (using the factory we provide), and the view callback we provide will pair that model with an
 * appropriate view.
 */
export const fluidExport = new ContainerViewRuntimeFactory(BubblebenchInstantiationFactory, bubblebenchViewCallback);
