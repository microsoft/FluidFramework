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
    ButtonInstantiationFactory ,
    NumberInstantiationFactory,
    TextBoxInstantiationFactory,
    FacePileInstantiationFactory,
} from "./components";
import {
    Manager,
} from "./container-services";
import { SpacesInstantiationFactory } from "./spaces";

const chaincodeName = "spaces";

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also enables dynamic loading in the
 * EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    chaincodeName,
    new Map([
        [ClickerName, Promise.resolve(ClickerInstantiationFactory)],
        [chaincodeName, Promise.resolve(SpacesInstantiationFactory)],
        ["button", Promise.resolve(ButtonInstantiationFactory)],
        ["number", Promise.resolve(NumberInstantiationFactory)],
        ["textbox", Promise.resolve(TextBoxInstantiationFactory)],
        ["facepile", Promise.resolve(FacePileInstantiationFactory)],
        ["codemirror", Promise.resolve(cmfe)],
        ["prosemirror", Promise.resolve(pmfe)],
    ]),
    [["manager", async (r) => new Manager(r)]],
);
