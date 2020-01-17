/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

import {ClickerName, ClickerInstantiationFactory} from "@fluid-example/clicker";
import { fluidExport as cmfe } from "@fluid-example/codemirror/dist/codemirror";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import { fluidExport as tofe } from "@fluid-example/todo";

// eslint-disable import/no-internal-modules
import { BirthdayCountdownInstantiationFactory } from "./components/birthdayCountdown";
import { ButtonInstantiationFactory } from "./components/button";
import { NumberInstantiationFactory } from "./components/number";
import { Manager } from "./components/manager";
import { TextBoxInstantiationFactory } from "./components/textBox";
import { FacePileInstantiationFactory } from "./components/facePile";
import { SpacesInstantiationFactory  } from "./main";
// eslint-enable import/no-internal-modules

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
        ["manager", Promise.resolve(Manager.getFactory())],
        ["textbox", Promise.resolve(TextBoxInstantiationFactory)],
        ["facepile", Promise.resolve(FacePileInstantiationFactory)],
        ["codemirror", Promise.resolve(cmfe)],
        ["prosemirror", Promise.resolve(pmfe)],
        ["todo", Promise.resolve(tofe)],
        ["birthday", Promise.resolve(BirthdayCountdownInstantiationFactory)],
    ]),
);
