/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidProps,
    IFluidFunctionalComponentViewState,
    useStateFluid,
    IFluidFunctionalComponentFluidState,
    SyncedComponent,
} from "@fluidframework/react";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerFunctionalName = pkg.name as string;

// ----- REACT STUFF -----

interface ICounterState {
    value: number;
}

// // ---- React Functional Component w/ useState ----

interface ICounterFunctionalViewState
    extends IFluidFunctionalComponentViewState,
    ICounterState {}
interface ICounterFunctionalFluidState
    extends IFluidFunctionalComponentFluidState,
    ICounterState {}

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
            <span>
                {state.value}
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
export class ClickerFunctional extends SyncedComponent {
    constructor(props) {
        super(props);

        this.setConfig<ICounterState>(
            "counter-functional",
            {
                syncedStateId: "counter-functional",
                fluidToView:  new Map([
                    [
                        "value", {
                            type: "number",
                            viewKey: "value",
                        },
                    ],
                ]),
                defaultViewState: { value: 0 },
            },
        );
    }
    /**
     * Will return a new ClickerFunctional view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctional
                    syncedStateId={"counter-functional"}
                    syncedComponent={this}
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
    [],
    {},
);
export const fluidExport = ClickerFunctionalInstantiationFactory;
