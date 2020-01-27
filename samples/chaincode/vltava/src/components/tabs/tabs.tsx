/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";

import * as ReactDOM from "react-dom";

import { tabsView } from "./view";

export class TabsComponent extends PrimedComponent implements IComponentHTMLVisual {
    private static readonly factory = new PrimedComponentFactory(TabsComponent, []);

    public static getFactory() {
        return TabsComponent.factory;
    }

    public get IComponentHTMLVisual() { return this; }

    public render(div: HTMLElement) {
        ReactDOM.render(
            tabsView(),
            div);
    }
}
