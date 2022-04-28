/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SyncedDataObject,
    useSyncedCounter,
    useSyncedString,
} from "@fluid-experimental/react";
import { CollaborativeInput } from "@fluid-experimental/react-inputs";
import { SharedString } from "@fluidframework/sequence";
import * as React from "react";

// Interfaces

interface ILikesViewProps {
    syncedDataObject: SyncedDataObject,
}

// ---- Fluid Object w/ a Functional React view using a mixture of DDSes and local state ----

export function LikesView(
    props: ILikesViewProps,
) {
    // Use synced states
    const [likes, likesReducer] = useSyncedCounter(props.syncedDataObject, "likes");
    const [imgUrl, setImgUrl] = useSyncedString(props.syncedDataObject, "imgUrl");

    // Render
    return (
        <div>
            <div>
                <img width="100%" src={imgUrl?.getText()}/>
                {imgUrl !== undefined
                    ? <CollaborativeInput
                        style={{ width: "90%" }}
                        sharedString={imgUrl}
                        onInput={(value: SharedString) => setImgUrl({ value })}
                    />
                    : undefined}
            </div>
            <span>
                {`Likes: ${likes}`}
            </span>
            <button onClick={() => likesReducer.increment(1)}>
                {"+"}
            </button>
        </div>
    );
}
