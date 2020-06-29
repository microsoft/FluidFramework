/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidFunctionalComponentViewState,
    createContextFluid,
    IFluidDataProps,
    IFluidFunctionalComponentFluidState,
    IFluidContextProps,
    SyncedComponent,
} from "@fluidframework/react";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerContextName = pkg.name as string;

// ----- REACT STUFF -----
interface CounterState {
    value: number;
}

interface ICounterFunctionalViewState
    extends IFluidFunctionalComponentViewState,
    CounterState {}
interface ICounterFunctionalFluidState
    extends IFluidFunctionalComponentFluidState,
    CounterState {}

function CounterReactFunctionalContext(
    props: IFluidContextProps<
    ICounterFunctionalViewState,
    ICounterFunctionalFluidState,
    IFluidDataProps
    >,
) {
    const { Provider, Consumer, state, setState } = createContextFluid(props, { value: 0 });
    // The following is wrapped in some extra divs to show how the context is being passed from
    // a parent to a child layer without prop drilling being required.
    return (
        <div>
            <Provider
                value={{ state, setState, reactContext: {} }}
            >
                <div>
                    <Consumer>
                        {(context) => (
                            <div>
                                <span
                                    className="clickerWithHooks-value-class-context"
                                    id={`clickerWithHooks-context-value-${Date.now().toString()}`}
                                >
                                    {`Context Component: ${context.state.value}`}
                                </span>
                                <button
                                    onClick={() => {
                                        context.setState({
                                            ...state,
                                            value: context.state.value + 1,
                                        });
                                    }}
                                >
                                    {"+"}
                                </button>
                            </div>
                        )}
                    </Consumer>
                </div>
            </Provider>
        </div>
    );
}

/**
 * Basic ClickerContext example using createContextFluid hook.
 */
export class ClickerContext extends SyncedComponent {
    constructor(props) {
        super(props);

        this.setConfig<CounterState>(
            "counter-context",
            {
                syncedStateId: "counter-context",
                fluidToView:  new Map([
                    [
                        "value", {
                            type: "number",
                            viewKey: "value",
                        },
                    ],
                ]),
                viewToFluid: new Map([
                    [
                        "value", {
                            type: "number",
                            fluidKey: "value",
                        },
                    ],
                ]),
                defaultViewState: { value: 0 },
            },
        );
    }
    /**
     * Will return a new ClickerContext view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctionalContext
                    syncedStateId={"counter-context"}
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
export const ClickerContextInstantiationFactory = new PrimedComponentFactory(
    ClickerContextName,
    ClickerContext,
    [],
    {},
);
export const fluidExport = ClickerContextInstantiationFactory;
