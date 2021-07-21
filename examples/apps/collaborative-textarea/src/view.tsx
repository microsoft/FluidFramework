/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { CollaborativeTextArea } from "@fluid-experimental/react-inputs";
import { SharedString } from "@fluidframework/sequence";

interface CollaborativeTextProps {
    text: SharedString;
}

export const CollaborativeTextView = (props: CollaborativeTextProps) => {
    return (
        <div className="text-area">
            <CollaborativeTextArea sharedString={props.text} />
        </div>
    );
};
