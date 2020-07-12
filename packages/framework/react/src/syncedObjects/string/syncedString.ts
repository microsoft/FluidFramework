/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@fluidframework/sequence";
import { SyncedComponent } from "../..";
import { useStateFluid } from "../../useStateFluid";
import { ISyncedStringState } from "./interface";

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
