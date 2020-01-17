/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { Manager } from "./manager";

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Button extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    protected async componentHasInitialized() {
        // Register with our manager to say that we support clicks
        const manager = await this.getComponent<Manager>("manager");
        manager.registerProducer("click", this);
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div style={{textAlign:"center", width: "100%", height:"100%", border:"1px solid black" }} onClick={() => this.emit("click")}>
                <h1 style={{display:"inline-block"}}>+</h1>
            </div>,
            div);
    }
}

/**
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const ButtonInstantiationFactory = new PrimedComponentFactory(
    Button,
    [],
);
