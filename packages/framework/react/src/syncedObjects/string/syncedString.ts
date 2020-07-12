/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@fluidframework/sequence";
import { SyncedComponent } from "../..";
import { useStateFluid } from "../../useStateFluid";
import { ISyncedStringState } from "./interface";

/**
 * Function to set the config for a synced string on a syncedComponent's SharedMap synced state. This
 * will initialize and provide a SharedString for the view to use. This SharedString provided is automatically
 * bound to the state update of the functional view useSyncedString is called in. It can also easily be placed
 * in a CollaborativeInput within a React view.
 * @param syncedComponent - The Fluid component on which the synced state config is being set
 * @param syncedStateId - The ID of the view state that this config schema is being set for
 * @param defaultValue - The default string that the SharedString will be initialized as
 */
export function setSyncedStringConfig(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
    defaultValue: string,
) {
    syncedComponent.setConfig<ISyncedStringState>(syncedStateId, {
        syncedStateId,
        fluidToView: new Map([
            [
                "value", {
                    type: SharedString.name,
                    viewKey: "value",
                    sharedObjectCreate: (runtime) => {
                        const url = SharedString.create(runtime);
                        url.insertText(0, defaultValue);
                        return url;
                    },
                },
            ],
        ]) as any,
        defaultViewState: { },
    });
}

/**
 * Function to use the SharedString state that has been prepared for this view
 * @param syncedComponent - The Fluid component that holds the synced state config for this view
 * @param syncedStateId - The ID of this view state
 * @returns [the initialized SharedString, a synced setState call for the SharedString]
 */
export function useSyncedString(
    syncedComponent: SyncedComponent,
    syncedStateId: string,
): [SharedString | undefined, (newState: ISyncedStringState) => void] {
    const [state, setState] = useStateFluid<ISyncedStringState, ISyncedStringState>(
        {
            syncedComponent,
            syncedStateId,
        }, { },
    );
    return [state.value, setState];
}
