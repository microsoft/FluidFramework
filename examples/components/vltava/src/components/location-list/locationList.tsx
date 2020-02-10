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

import { IComponentLocationData, ILocationData } from "../../interfaces";
import { ListView, LocationListItemCreator } from "./view";
import { IListViewDataModel } from "./interfaces";

/**
 * Button is a simple component that is just a button. It registers with the matchMaker so
 * when the button is pressed Components that consume clicks can do work
 */
export class LocationList extends PrimedComponent
    implements
        IComponentDiscoverableInterfaces,
        IComponentHTMLVisual,
        IComponentLocationData,
        IListViewDataModel
{
    public get IComponentDiscoverableInterfaces() { return this; }
    public get IComponentHTMLVisual() { return this; }
    public get IComponentLocationData() { return this; }

    public get items() {
        return [
            "foo",
            "bar",
        ];
    }

    public on(event: "itemChanged", listener: () => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    private static readonly factory = new PrimedComponentFactory(LocationList, []);

    public static getFactory() {
        return LocationList.factory;
    }

    public get discoverableInterfaces(): (keyof IComponent)[] {
        return [
            "IComponentLocationData",
        ];
    }

    public getLocations(): Iterable<ILocationData> {
        return [{
            x: 0,
            y: 0,
        }];
    }

    /**
     * If someone just calls render they are not providing a scope and we just pass
     * undefined in.
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <>
                <LocationListItemCreator addItem={() => {}}/>
                <ListView dataModel={this} />
            </>,
            div);
    }
}
