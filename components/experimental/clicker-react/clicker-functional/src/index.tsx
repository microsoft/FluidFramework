/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidProps,
    IFluidFunctionalComponentViewState,
    useStateFluid,
    IFluidFunctionalComponentFluidState,
    ViewToFluidMap,
    FluidToViewMap,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerFunctionalName = pkg.name as string;

// ----- REACT STUFF -----

interface CounterState {
    value: number;
}

// // ---- React Functional Component w/ useState ----

interface ICounterFunctionalViewState
    extends IFluidFunctionalComponentViewState,
    CounterState {}
interface ICounterFunctionalFluidState
    extends IFluidFunctionalComponentFluidState,
    CounterState {}

function CounterReactFunctional(
    props: IFluidProps<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState
    >,
) {
    const [state, setState] = useStateFluid<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState
    >(props, { value: 0 });

    return (
        <div>
            <span
                className="clickerWithHooks-value-class-functional"
                id={`clickerWithHooks-functional-value-${Date.now().toString()}`}
            >
                {`Functional Component: ${state.value}`}
            </span>
            <button
                onClick={() => {
                    setState({ ...state, value: state.value + 1 });
                }}
            >
                +
            </button>
        </div>
    );
}

/**
 * Basic ClickerFunctional example showing Clicker as a React Functional component
 */
export class ClickerFunctional extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() {
        return this;
    }

    // #region IComponentHTMLView

    /**
     * Will return a new ClickerWithHooks view
     */
    public render(div: HTMLElement) {
        const functionalFluidToView: FluidToViewMap<
        ICounterFunctionalViewState,
        ICounterFunctionalFluidState
        > = new Map();
        functionalFluidToView.set("value", {
            viewConverter: (
                syncedState: Partial<ICounterFunctionalFluidState>,
            ) => {
                return {
                    value: syncedState.value,
                };
            },
        });
        const functionalViewToFluid: ViewToFluidMap<
        ICounterFunctionalViewState,
        ICounterFunctionalFluidState
        > = new Map();
        functionalViewToFluid.set("value", {
            fluidKey: "value",
            fluidConverter: (
                state: Partial<IFluidFunctionalComponentViewState>,
            ) => state,
        });

        ReactDOM.render(
            <div>
                <CounterReactFunctional
                    syncedStateId={"counter-functional"}
                    root={this.root}
                    dataProps={{
                        fluidComponentMap: new Map(),
                        runtime: this.runtime,
                    }}
                    fluidToView={functionalFluidToView}
                    viewToFluid={functionalViewToFluid}
                />
            </div>,
            div,
        );
        return div;
    }

    // #endregion IComponentHTMLView
}

// ----- FACTORY SETUP -----
export const ClickerFunctionalInstantiationFactory = new PrimedComponentFactory(
    ClickerFunctionalName,
    ClickerFunctional,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerFunctionalInstantiationFactory;
