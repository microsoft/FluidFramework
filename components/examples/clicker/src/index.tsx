/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    FluidReactComponent,
    IFluidFunctionalComponentFluidState,
    IFluidFunctionalComponentViewState,
    ViewToFluidMap,
    FluidToViewMap,
} from "@microsoft/fluid-aqueduct-react";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerName = pkg.name as string;

// ----- REACT STUFF -----

// ---- React Class Component ----

interface CounterReactState extends IFluidFunctionalComponentViewState {
    value: number;
}

interface CounterFluidState extends IFluidFunctionalComponentFluidState {
    value: number
}

class CounterReactView extends FluidReactComponent<CounterReactState, CounterFluidState> {
    render() {
        return (
            <div>
                <span className="clicker-value-class" id={`clicker-value-${Date.now().toString()}`}>
                    {this.state.value}
                </span>
                <button onClick={() => { this.setState({ value: this.state.value + 1 }); }}>+</button>
            </div>
        );
    }
}

/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export class Clicker extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    /**
     * Do setup work here
     */
    protected async componentInitializingFirstTime() {
        this.root.set("counterClicks", 0);
    }

    // #region IComponentHTMLView

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        const viewToFluid: ViewToFluidMap<CounterReactState,CounterFluidState> = new Map();
        viewToFluid.set("value", {
            rootKey: "value",
            rootConverter: (viewState: Partial<CounterReactState>) => {
                return {
                    value: viewState.value,
                };
            },
        });

        const fluidToView: FluidToViewMap<CounterReactState,CounterFluidState> = new Map();
        fluidToView.set("value", {
            stateKey: "value",
            viewConverter: (syncedState: Partial<CounterFluidState>, fluidComponentMap) => {
                return {
                    value: syncedState.value,
                };
            },
        });

        ReactDOM.render(
            <div>
                <CounterReactView
                    root={this.root}
                    initialViewState={{ value: this.root.get("counterClicks") }}
                    initialFluidState={{ value: this.root.get("counterClicks") }}
                    viewToFluid={viewToFluid}
                    fluidToView={fluidToView}
                    fluidComponentMap={new Map()}
                />
            </div>,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const ClickerInstantiationFactory = new PrimedComponentFactory(ClickerName, Clicker, [], {});
export const fluidExport = ClickerInstantiationFactory;
