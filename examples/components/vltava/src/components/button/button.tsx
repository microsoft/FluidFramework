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
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { IComponentDiscoverableInterfaces } from "@microsoft/fluid-framework-interfaces";
import { IComponentClicks } from "../../interfaces/clicker";

const buttonStyle: React.CSSProperties = {
    WebkitUserSelect: "none", // Chrome-Safari
    MozUserSelect: "none", // Firefox
    msUserSelect: "none", //IE10+
    textAlign:"center",
    width: "100%",
    height:"100%",
    boxSizing: "border-box",
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

interface IButton {
    click();
}

/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class Button extends PrimedComponent
    implements
        IButton,
        IComponentHTMLVisual,
        IComponentDiscoverableInterfaces,
        IComponentClicks
{
    private readonly registeredCallbacks: (() => void)[] = [];

    private static readonly factory = new PrimedComponentFactory(Button, []);

    public static getFactory() {
        return Button.factory;
    }

    public get IComponentHTMLVisual() { return this; }

    public get IComponentDiscoverableInterfaces() { return this; }

    public get IComponentClicks() { return this; }

    public get discoverableInterfaces(): (keyof IComponent)[] {
        return [
            "IComponentClicks",
        ];
    }

    public onClick(fn: () => void) {
        this.registeredCallbacks.push(fn);
    }

    public click() {
        this.registeredCallbacks.forEach((fn) => {
            fn();
        });
    }

    protected async componentHasInitialized() {
        const matchMaker = await this.getService<IComponent>("matchMaker");
        const interfaceRegistry = matchMaker.IComponentInterfacesRegistry;
        if (interfaceRegistry) {
            interfaceRegistry.registerComponentInterfaces(this);
        }
    }

    /**
     * If someone just calls render they are not providing a scope and we just pass
     * undefined in.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div style={buttonStyle} onClick={this.click.bind(this)}>
                <h1 style={textStyle}>+</h1>
            </div>,
            div);
    }

}
