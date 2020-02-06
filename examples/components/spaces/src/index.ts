/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import {ClickerName, ClickerInstantiationFactory} from "@fluid-example/clicker";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";

import {
    AdderInstantiationFactory,
    ButtonInstantiationFactory,
    NumberInstantiationFactory,
    TextBoxInstantiationFactory,
    FacePileInstantiationFactory,
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
        ["button", Promise.resolve(ButtonInstantiationFactory)],
        ["number", Promise.resolve(NumberInstantiationFactory)],
        ["textbox", Promise.resolve(TextBoxInstantiationFactory)],
        ["facepile", Promise.resolve(FacePileInstantiationFactory)],
        ["codemirror", Promise.resolve(cmfe)],
        ["prosemirror", Promise.resolve(pmfe)],
        ["adder", Promise.resolve(AdderInstantiationFactory)]
    ]),
    [["manager", async (r) => new Manager(r)]],
);
