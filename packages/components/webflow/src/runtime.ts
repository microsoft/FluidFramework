/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { FlowDocument } from "./document";
import { FlowEditor } from "./editor";
import { WebFlow } from "./host";

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(
        context,
        WebFlow.type,
        new Map([
            [WebFlow.type, Promise.resolve(Component.createComponentFactory(WebFlow))],
            [FlowDocument.type, Promise.resolve(Component.createComponentFactory(FlowDocument))],
            [FlowEditor.type, Promise.resolve(Component.createComponentFactory(FlowEditor))],
        ]));
}
