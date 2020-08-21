/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import {
    SyncedDataObject,
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
    syncedDataObject: SyncedDataObject,
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
    const [likes, likesReducer] = useSyncedCounter(props.syncedDataObject, "likes");
    const [comments, commentReducer] = useSyncedArray<IComment>(props.syncedDataObject, "comments");
    const [imgUrl, setImgUrl] = useSyncedString(props.syncedDataObject,"imgUrl");
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
                                author: getAuthorName(props.syncedDataObject),
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

export class LikesAndComments extends SyncedDataObject {
    public static get Name() { return "LikesAndComments"; }

    public static readonly factory = new DataObjectFactory(
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

    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>
                <LikesAndCommentsView
                    syncedDataObject={this}
                />
            </div>,
            div,
        );
        return div;
    }
}
