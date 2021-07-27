/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { IEvent } from "@fluidframework/common-definitions";
import {
    SyncedDataObject,
    setSyncedCounterConfig,
    setSyncedArrayConfig,
    setSyncedStringConfig,
} from "@fluid-experimental/react";
import { SharedCounter } from "@fluidframework/counter";
import { SharedObjectSequence, SharedString } from "@fluidframework/sequence";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { LikesAndCommentsView, IComment } from "./view";

const defaultImgUrl = "https://picsum.photos/id/221/1200/800";

export class LikesAndComments extends SyncedDataObject {
    public static get Name() { return "LikesAndComments"; }

    public static readonly factory =
        new DataObjectFactory<LikesAndComments, unknown, unknown, IEvent>(
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

    public render(el: HTMLElement) {
        ReactDOM.render(
            <LikesAndCommentsView
                syncedDataObject={this}
            />,
            el,
        );
        return el;
    }
}
