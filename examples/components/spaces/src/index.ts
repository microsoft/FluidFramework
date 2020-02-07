/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import {ClickerName, ClickerInstantiationFactory} from "@fluid-example/clicker";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";

import {
    ComponentToolbar,
    ComponentToolbarName,
    Button,
    Number,
    TextBox,
    FacePile,
} from "./components";
import {
    Manager,
} from "./container-services";
import { Spaces } from "./spaces";

const componentName = "spaces";

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    componentName,
    new Map([
        [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
        [componentName, Promise.resolve(Spaces.getFactory())],
        [ComponentToolbarName, Promise.resolve(ComponentToolbar.getFactory())],
        ["button", Promise.resolve(Button.getFactory())],
        ["number", Promise.resolve(Number.getFactory())],
        ["textbox", Promise.resolve(TextBox.getFactory())],
        ["facepile", Promise.resolve(FacePile.getFactory())],
        ["codemirror", Promise.resolve(cmfe)],
        ["prosemirror", Promise.resolve(pmfe)],
    ]),
    [["manager", async (r) => new Manager(r)]],
);
