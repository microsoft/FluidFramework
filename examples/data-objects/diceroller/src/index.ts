/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { DiceRoller, DiceRollerInstantiationFactory, DiceRollerView } from "./main.js";

export { DiceRoller, DiceRollerInstantiationFactory } from "./main.js";

const diceRollerViewCallback = (model: DiceRoller) =>
	React.createElement(DiceRollerView, { model });

/**
 * This does setup for the Container. The ContainerViewRuntimeFactory will instantiate a single Fluid object to use
 * as our model (using the factory we provide), and the view callback we provide will pair that model with an
 * appropriate view.
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory(
	DiceRollerInstantiationFactory,
	diceRollerViewCallback,
);
