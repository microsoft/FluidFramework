/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";


/**
 * Dice roller example using view interfaces and stock component classes.
 */
class WebRTCComponent extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }


    /**
     * Render the dice.
     */
    public render(div: HTMLElement) {
        const rerender = () => {

        };

        rerender();
        this.root.on("valueChanged", () => {
            rerender();
        });
    }

}

export const fluidExport = new PrimedComponentFactory(WebRTCComponent);
