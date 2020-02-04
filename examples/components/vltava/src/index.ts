/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { ClickerName, ClickerInstantiationFactory } from "@fluid-example/clicker";
import { Spaces } from "@fluid-example/spaces/dist/spaces";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import { TabsComponent } from "./components";
import { Vltava } from "./vltava";

const componentName = "vltava";

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    componentName,
    new Map([
        [componentName, Promise.resolve(Vltava.getFactory())],
        [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
        ["tabs", Promise.resolve(TabsComponent.getFactory())],
        ["spaces", Promise.resolve(Spaces.getFactory())],
        ["codemirror", Promise.resolve(cmfe)],
        ["prosemirror", Promise.resolve(pmfe)],
    ]),
);
