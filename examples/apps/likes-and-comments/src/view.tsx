/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SyncedDataObject,
    useSyncedCounter,
    useSyncedArray,
    useSyncedString,
} from "@fluid-experimental/react";
import { CollaborativeInput } from "@fluid-experimental/react-inputs";
import { SharedString } from "@fluidframework/sequence";
import * as React from "react";
import { getAuthorName } from "./utils";

// Interfaces

interface ILikesAndCommentsViewProps {
    syncedDataObject: SyncedDataObject,
}

export interface IComment {
    author: string,
    message: string;
}

// ---- Fluid Object w/ a Functional React view using a mixture of DDSes and local state ----

export function LikesAndCommentsView(
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
