/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    SyncedDataObject,
    setSyncedCounterConfig,
    useSyncedCounter,
} from "@fluid-experimental/react";
import { SharedCounter } from "@fluidframework/counter";
import * as React from "react";

// ---- Fluid Object w/ Functional React View using the useSyncedCounter hook ----

interface ICounterReactHookProps {
    syncedDataObject: SyncedDataObject,
    syncedStateId: string,
}

function CounterWithHook(
    props: ICounterReactHookProps,
) {
    const [value, reducer] = useSyncedCounter(
        props.syncedDataObject,
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
 * ClickerWithHook example using the useSyncedCounter hook
 */
export class ClickerWithHook extends SyncedDataObject {
    constructor(props) {
        super(props);
        setSyncedCounterConfig(this, "counter-with-hook");
    }
}

// ----- FACTORY SETUP -----
export const ClickerWithHookInstantiationFactory =
    new DataObjectFactory(
        "clicker-with-hook",
        ClickerWithHook,
        [SharedCounter.getFactory()],
        {},
    );

const clickerViewCallback = (clicker: ClickerWithHook) =>
    <CounterWithHook
        syncedStateId={ "counter-with-hook" }
        syncedDataObject={ clicker }
    />;

export const fluidExport =
    new ContainerViewRuntimeFactory<ClickerWithHook>(ClickerWithHookInstantiationFactory, clickerViewCallback);
