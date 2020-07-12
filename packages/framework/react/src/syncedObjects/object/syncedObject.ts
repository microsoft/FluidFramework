/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SyncedComponent } from "../..";
import { useStateFluid } from "../../useStateFluid";
import { ISyncedMapState } from "./interface";

export function setSyncedObjectConfig<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: T,
) {
    syncedComponent.setConfig<ISyncedMapState<T>>(syncedStateId, {
        syncedStateId,
        fluidToView: new Map([
            [
                "value", {
                    type: "any",
                    viewKey: "value",
                },
            ],
        ]) as any,
        defaultViewState: { value: defaultValue },
    });
}

export function useSyncedObject<T>(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: T,
): [T, (newState: T) => void] {
    const [state, setState] = useStateFluid<ISyncedMapState<T>, ISyncedMapState<T>>(
        {
            syncedComponent,
            syncedStateId,
        }, { value: defaultValue },
    );
    return [state.value, (newState: T) => setState({ value: newState })];
}
