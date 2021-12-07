/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    SyncedDataObject,
    setSyncedCounterConfig,
    setSyncedArrayConfig,
    setSyncedStringConfig,
} from "@fluid-experimental/react";
import { SharedCounter } from "@fluidframework/counter";
import { SharedObjectSequence, SharedString } from "@fluidframework/sequence";
import { IComment } from "./view";

const defaultImgUrl = "https://picsum.photos/id/221/1200/800";

export class LikesAndComments extends SyncedDataObject {
    public static get Name() { return "LikesAndComments"; }

    public static readonly factory =
        new DataObjectFactory(
            LikesAndComments.name,
            LikesAndComments,
            [
                SharedCounter.getFactory(),
                SharedObjectSequence.getFactory(),
                SharedString.getFactory(),
            ],
            {},
        );

    constructor(props) {
        super(props);
        // Declare configs for each synced state the view will need
        setSyncedCounterConfig(
            this,
            "likes",
        );
        setSyncedArrayConfig<IComment>(
            this,
            "comments",
        );
        setSyncedStringConfig(
            this,
            "imgUrl",
            defaultImgUrl,
        );
    }
}
