/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    setSyncedObjectConfig,
    useSyncedObject,
    SyncedComponent,
} from "@fluidframework/react";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerFunctionalName = pkg.name as string;

// ---- React Functional Component w/ useSyncedObject ----

interface ICounterReactFunctionalProps {
    syncedComponent: SyncedComponent,
    syncedStateId: string,
}

interface ICounterReactFunctionalState {
    value: number
}

function CounterReactFunctional(
    props: ICounterReactFunctionalProps,
) {
    const [state, setState] = useSyncedObject<ICounterReactFunctionalState>(
        props.syncedComponent,
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
 * Basic ClickerFunctional example showing Clicker as a React Functional component
 */
export class ClickerFunctional extends SyncedComponent {
    constructor(props) {
        super(props);
        setSyncedObjectConfig<number>(this, "counter-functional", 0);
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
}

// ----- FACTORY SETUP -----
export const ClickerFunctionalInstantiationFactory = new PrimedComponentFactory(
    ClickerFunctionalName,
    ClickerFunctional,
    [],
    {},
);
export const fluidExport = ClickerFunctionalInstantiationFactory;
