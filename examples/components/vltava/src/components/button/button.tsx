/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHTMLVisual,
    IComponentHTMLView,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

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

class ButtonView implements IComponentHTMLView {

    public constructor(public scope: IComponent) {
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div style={buttonStyle} onClick={() => alert("not implemented")}>
                <h1 style={textStyle}>+</h1>
            </div>,
            div);
    }

    public remove() {
        // Nothing happens here
    }
}

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Button extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    private static readonly factory = new PrimedComponentFactory(Button, []);

    public static getFactory() {
        return Button.factory;
    }

    protected async componentHasInitialized() {
    }

    /**
     * If someone just calls render they are not providing a scope and we just pass
     * undefined in.
     */
    public render(div: HTMLElement) {
        const view = new ButtonView(undefined);
        return view.render(div);
    }

    public addView(scope: IComponent) {
        return new ButtonView(scope);
    }
}
