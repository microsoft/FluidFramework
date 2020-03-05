/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import { ClickerName, ClickerInstantiationFactory } from "@fluid-example/clicker";
import { fluidExport as cmfe } from "@fluid-example/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror";

import {
    ComponentToolbar,
    ComponentToolbarName,
    Button,
    ButtonName,
    Number,
    NumberName,
    TextBox,
    TextBoxName,
    FacePile,
    FacePileName,
} from "./components";
import {
    Manager,
} from "./container-services";
import { Spaces } from "./spaces";

const componentName = Spaces.getFactory().type;

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
        [ButtonName, Promise.resolve(Button.getFactory())],
        [NumberName, Promise.resolve(Number.getFactory())],
        [TextBoxName, Promise.resolve(TextBox.getFactory())],
        [FacePileName, Promise.resolve(FacePile.getFactory())],
        [cmfe.type, Promise.resolve(cmfe)],
        [pmfe.type, Promise.resolve(pmfe)],
    ]),
    [["manager", async (r) => new Manager(r)]],
);
