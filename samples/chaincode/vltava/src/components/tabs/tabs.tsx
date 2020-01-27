/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { IComponentHTMLVisual } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

export class Tabs extends PrimedComponent implements IComponentHTMLVisual {
    private static readonly factory = new PrimedComponentFactory(Tabs, []);

    public static getFactory() {
        return Tabs.factory;
    }

    public get IComponentHTMLVisual() { return this; }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>hello tabs</div>,
            div);
    }
}
