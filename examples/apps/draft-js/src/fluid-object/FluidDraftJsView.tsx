/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { MemberList } from "./MemberList";
import { FluidEditor } from "./FluidEditor";

import { FluidDraftJsObject } from "./FluidDraftJs";

interface IAppProps {
    model: FluidDraftJsObject;
}

/**
 * The entirety of the View logic is encapsulated within the App.
 * The App uses the provided model to interact with Fluid.
 */
export const FluidDraftJsView: React.FC<IAppProps> = (props) => {

    return (
        <div style={{ margin: "20px auto", maxWidth: 800 }}>
            <MemberList quorum={props.model.quorum} authors={props.model.authors} style={{ textAlign: "right" }} />
            <FluidEditor sharedString={props.model.text} authors={props.model.authors} runtime={props.model.runtime} />
        </div>
    );
};
