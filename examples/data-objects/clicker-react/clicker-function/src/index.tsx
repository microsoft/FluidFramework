/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import {
    setSyncedObjectConfig,
    useSyncedObject,
    SyncedDataObject,
} from "@fluid-experimental/react";
import * as React from "react";
import * as ReactDOM from "react-dom";

// ---- Fluid Object w/ Functional React View using the useSyncedObject hook ----

interface ICounterReactFunctionalProps {
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
}

interface ICounterReactFunctionalState {
    value: number
}

function CounterReactFunction(
    props: ICounterReactFunctionalProps,
) {
    const [state, setState] = useSyncedObject<ICounterReactFunctionalState>(
        props.syncedDataObject,
        props.syncedStateId,
        { value: 0 },
    );

    return (
        <div>
            <span className="value">
                {state.value}
            </span>
            <button onClick={() => setState({ value: state.value + 1 })}>
                +
            </button>
        </div>
    );
}

/**
 * Basic ClickerFunction example showing Clicker Fluid object as a React Function component
 */
export class ClickerFunction extends SyncedDataObject {
    constructor(props) {
        super(props);
        setSyncedObjectConfig<number>(this, "counter-function", 0);
    }
    /**
     * Will return a new ClickerFunction view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactFunction
                    syncedStateId={"counter-function"}
                    syncedDataObject={this}
                />
            </div>,
            div,
        );
        return div;
    }
}

// ----- FACTORY SETUP -----
export const ClickerFunctionInstantiationFactory =
    new DataObjectFactory<ClickerFunction, unknown, unknown, IEvent>(
        "clicker-function",
        ClickerFunction,
        [],
        {},
    );
export const fluidExport = ClickerFunctionInstantiationFactory;
