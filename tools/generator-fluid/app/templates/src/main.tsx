/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@prague/aqueduct";
import {
    IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import {
    CounterValueType,
} from "@prague/map";
import {
    IComponentContext,
    IComponentRuntime,
} from "@prague/runtime-definitions";

import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time your component
     * is created. Anything that happens in componentInitializingFirstTime will happen before any other user will see the component.
     */
    protected async componentInitializingFirstTime() {
        this.root.set("clicks", 0, CounterValueType.Name);
    }

    /**
     * Static load function that allows us to make async calls while creating our object.
     * This becomes the standard practice for creating components in the new world.
     * Using a static allows us to have async calls in class creation that you can't have in a constructor
     */
    public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<Clicker> {
        const clicker = new Clicker(runtime, context);
        await clicker.initialize();

        return clicker;
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        // Get our counter object that we set in initialize and pass it in to the view.
        const counter = this.root.get("clicks");

        const rerender = () => {
            ReactDOM.render(
                <div>
                    <span>{counter.value}</span>
                    <button onClick={() => counter.increment(1)}>+</button>
                </div>,
                div
            );
        };

        rerender();
        this.root.on("valueChanged", () => {
            rerender();
        });
        return div;
    }

    public remove() {
            throw new Error("Not Implemented");
    }
}

/**
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const ClickerInstantiationFactory = new PrimedComponentFactory(
    Clicker,
    [],
);
