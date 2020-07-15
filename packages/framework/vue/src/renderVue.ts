/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import ReactDOM from "react-dom";
import { SyncedComponent } from "@fluidframework/react";
import { FluidVueComponent } from "./fluidVueComponent";

export function renderVue(
    div: HTMLElement,
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    vueComponent: any,
) {
    ReactDOM.render(
        React.createElement(FluidVueComponent, {
            syncedComponent,
            syncedStateId,
            vueComponent,
        }),
        div,
    );
    return div;
}
