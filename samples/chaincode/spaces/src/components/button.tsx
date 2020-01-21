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

const buttonStyle: React.CSSProperties = {
    WebkitUserSelect: "none", // Chrome-Safari
    MozUserSelect: "none", // Firefox
    msUserSelect: "none", //IE10+
    textAlign:"center",
    width: "100%",
    height:"100%",
    border:"1px solid black",
    cursor: "pointer",
};

const textStyle: React.CSSProperties = {
    WebkitUserSelect: "none", // Chrome-Safari
    MozUserSelect: "none", // Firefox
    msUserSelect: "none", //IE10+
    display:"inline-block",
    cursor: "pointer",
};

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Button extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    protected async componentHasInitialized() {
        // Register with our manager to say that we support clicks
        const manager = await this.getService<Manager>("manager");
        manager.registerProducer("click", this);
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div style={buttonStyle} onClick={() => this.emit("click")}>
                <h1 style={textStyle}>+</h1>
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
