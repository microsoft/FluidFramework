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
/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class EventItem extends PrimedComponent
    implements
        IComponentHTMLVisual,
        IComponentDiscoverableInterfaces
{
    private static readonly factory = new PrimedComponentFactory(EventItem, []);

    public static getFactory() {
        return EventItem.factory;
    }

    public get IComponentHTMLVisual() { return this; }
    public get IComponentDiscoverableInterfaces() { return this; }


    public get discoverableInterfaces(): (keyof IComponent)[] {
        return [];
    }

    protected async componentHasInitialized() {
    }

    /**
     * If someone just calls render they are not providing a scope and we just pass
     * undefined in.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                Event
            </div>,
            div);
    }

}
