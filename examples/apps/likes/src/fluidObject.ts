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
    setSyncedStringConfig,
} from "@fluid-experimental/react";
import { SharedCounter } from "@fluidframework/counter";
import { SharedString } from "@fluidframework/sequence";

const defaultImgUrl = "https://picsum.photos/id/221/1200/800";

export class Likes extends SyncedDataObject {
    public static get Name() { return "Likes"; }

    public static readonly factory =
        new DataObjectFactory(
            Likes.name,
            Likes,
            [
                SharedCounter.getFactory(),
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
        setSyncedStringConfig(
            this,
            "imgUrl",
            defaultImgUrl,
        );
    }
}
