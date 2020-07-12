/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponentFactory,
} from "@fluidframework/aqueduct";
import {
    SyncedComponent,
    setSyncedCounterConfig,
    useSyncedCounter,
} from "@fluidframework/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";
import * as ReactDOM from "react-dom";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const ClickerHookName = pkg.name as string;

// ---- React Functional Component w/ useSyncedCounter ----

interface ICounterReactHookProps {
    syncedComponent: SyncedComponent,
    syncedStateId: string,
}

function CounterReactHook(
    props: ICounterReactHookProps,
) {
    const [value, reducer] = useSyncedCounter(
        props.syncedComponent,
        props.syncedStateId,
    );

    return (
        <div>
            <span className="value">
                {value}
            </span>
            <button onClick={() => reducer.increment(1)}>
                +
            </button>
        </div>
    );
}

/**
 * ClickerHook example using the useSyncedCounter hook
 */
export class ClickerHook extends SyncedComponent {
    constructor(props) {
        super(props);
        setSyncedCounterConfig(this, "counter-hook");
    }

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <CounterReactHook
                    syncedComponent={this}
                    syncedStateId={"counter-hook"}
                />
            </div>,
            div,
        );
        return div;
    }
}

// ----- FACTORY SETUP -----
export const ClickerHookInstantiationFactory = new PrimedComponentFactory(
    ClickerHookName,
    ClickerHook,
    [SharedCounter.getFactory()],
    {},
);
export const fluidExport = ClickerHookInstantiationFactory;
