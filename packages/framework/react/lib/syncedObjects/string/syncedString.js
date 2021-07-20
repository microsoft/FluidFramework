/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedString } from "@fluidframework/sequence";
import { useStateFluid } from "../../useStateFluid";
/**
 * Function to set the config for a synced string on a syncedDataObject's SharedMap synced state. This
 * will initialize and provide a SharedString for the view to use. This SharedString provided is automatically
 * bound to the state update of the functional view useSyncedString is called in. It can also easily be placed
 * in a CollaborativeInput within a React view.
 * @param syncedDataObject - The Fluid data object on which the synced state config is being set
 * @param syncedStateId - The ID of the view state that this config schema is being set for
 * @param defaultValue - The default string that the SharedString will be initialized as
 */
export function setSyncedStringConfig(syncedDataObject, syncedStateId, defaultValue) {
    syncedDataObject.setConfig(syncedStateId, {
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
        ]),
        defaultViewState: {},
    });
}
/**
 * Function to use the SharedString state that has been prepared for this view
 * @param syncedDataObject - The Fluid data object that holds the synced state config for this view
 * @param syncedStateId - The ID of this view state
 * @returns [the initialized SharedString, a synced setState call for the SharedString]
 */
export function useSyncedString(syncedDataObject, syncedStateId) {
    const [state, setState] = useStateFluid({
        syncedDataObject,
        syncedStateId,
    }, {});
    return [state.value, setState];
}
//# sourceMappingURL=syncedString.js.map