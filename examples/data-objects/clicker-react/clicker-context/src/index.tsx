/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    IViewState,
    createContextFluid,
    IFluidDataProps,
    IFluidState,
    IFluidContextProps,
    SyncedDataObject,
} from "@fluid-experimental/react";
import * as React from "react";

// ----- REACT STUFF -----
interface ICounterState {
    value: number;
}

interface ICounterFunctionalViewState
    extends IViewState,
    ICounterState { }
interface ICounterFunctionalFluidState
    extends IFluidState,
    ICounterState { }

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
                                <span className="value">
                                    {context.state.value}
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
export class ClickerContext extends SyncedDataObject {
    constructor(props) {
        super(props);

        this.setConfig<ICounterState>(
            "counter-context",
            {
                syncedStateId: "counter-context",
                fluidToView: new Map([
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
}

// ----- FACTORY SETUP -----
export const ClickerContextInstantiationFactory =
    new DataObjectFactory(
        "clicker-context",
        ClickerContext,
        [],
        {},
    );

const clickerViewCallback = (clicker: ClickerContext) =>
    <CounterReactFunctionalContext
        syncedStateId={ "counter-context" }
        syncedDataObject={ clicker }
    />;

export const fluidExport =
    new ContainerViewRuntimeFactory<ClickerContext>(ClickerContextInstantiationFactory, clickerViewCallback);
