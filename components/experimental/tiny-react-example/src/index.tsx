/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { createTinyFluidReactComponentFactory } from "@fluidframework/tiny-react";
import { Counter } from "./Counter";
import { DiceRoller } from "./DiceRoller";
import { HelloWorld } from "./HelloWorld";

// Re-export the React Functions
export { Counter, DiceRoller, HelloWorld };

/**
 * our factory allows consumers of our package to create and use our Fluid Component
 */
export const factory = createTinyFluidReactComponentFactory(
    "tiny-react-example",
    <>
        <HelloWorld />
        <DiceRoller />
        <Counter id={"counter1-key"} />
        <Counter id={"counter2-key"} />
    </>);

/**
 * fluidExport is the entry point of the fluid package. We define our component
 * as a component that can be created in the container.
 */
export const fluidExport = factory;
