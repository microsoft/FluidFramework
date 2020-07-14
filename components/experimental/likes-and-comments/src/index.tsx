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
    setSyncedArrayConfig,
    useSyncedArray,
    setSyncedStringConfig,
    useSyncedString,
} from "@fluidframework/react";
import { CollaborativeInput } from "@fluidframework/react-inputs";
import { SharedCounter } from "@fluidframework/counter";
import { SharedObjectSequence, SharedString } from "@fluidframework/sequence";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { getAuthorName } from "./utils";

const defaultImgUrl = "https://picsum.photos/id/221/1200/800";

// Interfaces

interface ILikesAndCommentsViewProps {
    syncedComponent: SyncedComponent,
}

interface IComment {
    author: string,
    message: string;
}

// ---- Functional Component w/ a mixture of DDS' and local state ----

function LikesAndCommentsView(
    props: ILikesAndCommentsViewProps,
) {
    // Use synced states
    const [likes, likesReducer] = useSyncedCounter(props.syncedComponent, "likes");
    const [comments, commentReducer] = useSyncedArray<IComment>(props.syncedComponent, "comments");
    const [imgUrl, setImgUrl] = useSyncedString(props.syncedComponent,"imgUrl");
    // Use local state
    const [currentComment, setCurrentComment] = React.useState("");

    // Convert data to JSX for comments state
    const commentListItems = comments.map((item, key) => (
        <li key={key}>
            {`${item.author}: ${item.message}`}
        </li>
    ));

    // Render
    return (
        <div>
            <div>
                <img width='100%' src={imgUrl?.getText()}/>
                {imgUrl !== undefined
                    ? <CollaborativeInput
                        style={{ width: "90%" }}
                        sharedString={imgUrl}
                        onChange={(value: SharedString) => setImgUrl({ value })}
                    />
                    : undefined}
            </div>
            <span>
                {`Likes: ${likes}`}
            </span>
            <button onClick={() => likesReducer.increment(1)}>
                {"+"}
            </button>
            <div>
                <div>
                    <input
                        type="text"
                        value={currentComment}
                        onChange={(e) => setCurrentComment(e.target.value)}
                        placeholder="Add Comment"
                    />
                    <button
                        onClick={() => {
                            commentReducer.add({
                                message: currentComment,
                                author: getAuthorName(props.syncedComponent),
                            });
                            setCurrentComment("");
                        }}
                    >{"Submit"}</button>
                </div>
                <ul>{commentListItems}</ul>
            </div>
        </div>
    );
}

/**
 * LikesAndComments example using multiple DDS hooks
 */
export class LikesAndComments extends SyncedComponent {
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

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <LikesAndCommentsView
                    syncedComponent={this}
                />
            </div>,
            div,
        );
        return div;
    }
}

// ----- FACTORY SETUP -----
export const LikesAndCommentsInstantiationFactory = new PrimedComponentFactory(
    "likes-and-comments",
    LikesAndComments,
    [
        SharedCounter.getFactory(),
        SharedObjectSequence.getFactory(),
        SharedString.getFactory(),
    ],
    {},
);
export const fluidExport = LikesAndCommentsInstantiationFactory;
