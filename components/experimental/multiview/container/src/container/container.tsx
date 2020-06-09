/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { RequestParser, RuntimeRequestHandler } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { MountableView } from "@fluidframework/view-adapters";

import * as React from "react";

import { OptionPicker, OptionPickerInstantiationFactory } from "../model";
import { OptionPickerView } from "../view";

const optionPickerComponentId = "optionPicker";

const registryEntries = new Map([
    OptionPickerInstantiationFactory.registryEntry,
]);

const defaultViewRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const modelRequest = new RequestParser({
                url: `${optionPickerComponentId}`,
                headers: request.headers,
            });
            const model = (await runtime.request(modelRequest)).value as OptionPicker;
            return { status: 200, mimeType: "fluid/view", value: <OptionPickerView model={model} /> };
        }
    };

const viewRequestHandlers = [
    mountableViewRequestHandler(MountableView),
    defaultViewRequestHandler,
];

export class OptionPickerContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(registryEntries, [], viewRequestHandlers);
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const componentRuntime = await runtime.createComponent(optionPickerComponentId, OptionPicker.ComponentName);
        const result = await componentRuntime.request({ url: optionPickerComponentId });
        if (result.status !== 200 || result.mimeType !== "fluid/component") {
            throw new Error("Error in creating the default option picker model.");
        }

        componentRuntime.attach();
    }
}
