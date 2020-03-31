/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { IComponentRuntime, IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { FluidRtcPeerConnectionManager } from "./peerConnectionManager";

/**
 * Dice roller example using view interfaces and stock component classes.
 */
class WebRTCComponent extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    constructor(runtime: IComponentRuntime, context: IComponentContext){
        super(runtime, context);
    }

    protected async componentHasInitialized(){
        await FluidRtcPeerConnectionManager.Initialize(this.context);
    }

    public render(div: HTMLElement) {
    }

}

export const fluidExport = new PrimedComponentFactory(WebRTCComponent);
