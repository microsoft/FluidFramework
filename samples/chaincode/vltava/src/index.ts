/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { ClickerInstantiationFactory } from "@fluid-example/clicker";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import { TabsComponent } from "./components";
import { Vltava } from "./vltava";

const chaincodeName = "vltava";

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    chaincodeName,
    new Map([
        [chaincodeName, Promise.resolve(Vltava.getFactory())],
        ["clicker", Promise.resolve(ClickerInstantiationFactory)],
        ["tabs", Promise.resolve(TabsComponent.getFactory())],
    ]),
);
