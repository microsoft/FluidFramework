/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    createContextFluid,
    IFluidDataProps,
    IFluidContextProps,
    SyncedComponent,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import {
    primitiveFluidToView,
    primitiveViewToFluid,
} from "@fluid-example/clicker-common";
import { ICounterState } from "@fluid-example/clicker-definitions";

import * as React from "react";
import * as ReactDOM from "react-dom";

function CounterReactFunctionalContext(
    props: IFluidContextProps<
    ICounterState,
    ICounterState,
    IFluidDataProps
    >,
) {
    const { Provider, Consumer, state, setState } = createContextFluid(props, { value: 0 });
    // The following is wrapped in some extra divs to show how the context is being passed from
    // a parent to a child layer without prop drilling being required.
    return (
        <div>
            <Provider
                value={{ state, setState, reactContext: props.reactContext }}
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
 * Basic ClickerWithHooks example using new interfaces and stock component classes.
 */
export class ClickerWithHooks extends SyncedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() {
        return this;
    }
    constructor(props) {
        super(props);

        this.syncedStateConfig.set(
            "counter-context",
            {
                syncedStateId: "counter-context",
                fluidToView: primitiveFluidToView,
                viewToFluid: primitiveViewToFluid,
                defaultViewState: {},
            },
        );
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunctionalContext
                    syncedStateId={"counter-context"}
                    syncedComponent={this}
                    reactContext={{}}
                />
            </div>,
            div,
        );
        return div;
    }
}

export const ClickerWithHooksInstantiationFactory = new PrimedComponentFactory(
    "clicker-context",
    ClickerWithHooks,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerWithHooksInstantiationFactory;
