/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    IFluidFunctionalComponentViewState,
    createContextFluid,
    IFluidDataProps,
    IFluidFunctionalComponentFluidState,
    FluidToViewMap,
    ViewToFluidMap,
    IFluidContextProps,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
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
 * Basic ClickerContext example using createContextFluid hook.
 */
export class ClickerContext extends PrimedComponent
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
                <CounterReactFunctionalContext
                    syncedStateId={"counter-context"}
                    root={this.root}
                    dataProps={{
                        fluidComponentMap: new Map(),
                        runtime: this.runtime,
                    }}
                    reactContext={{}}
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
export const ClickerContextInstantiationFactory = new PrimedComponentFactory(
    ClickerContextName,
    ClickerContext,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerContextInstantiationFactory;
