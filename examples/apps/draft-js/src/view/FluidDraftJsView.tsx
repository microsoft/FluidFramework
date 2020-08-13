/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

import { FluidDraftJsObject, IFluidDraftJsObject } from "../fluid-object";
import { MemberList } from "./MemberList";
import { FluidEditor } from "./FluidEditor";

interface IAppProps {
    model: FluidDraftJsObject;
}

/**
 * The entirety of the View logic is encapsulated within the App.
 * The App uses the provided model to interact with Fluid.
 */
export const FluidDraftJsView: React.FC<IAppProps> = (props) => {
    const [members, setMembers] = React.useState<IFluidDraftJsObject["members"]>(props.model.members);

    React.useEffect(() => {
        const onMembersChange = () => {
            setMembers(props.model.members);
        };
        props.model.on("addMember", onMembersChange);
        props.model.on("removeMember", onMembersChange);
        return () => {
            // When the view dismounts remove the listener to avoid memory leaks
            props.model.off("addMember", onMembersChange);
            props.model.off("removeMember", onMembersChange);
        };
    }, [props.model]);

    const onAuthorsOp = (callback: (op: ISequencedDocumentMessage, isLocal) => void) => {
        const func = (op: ISequencedDocumentMessage, isLocal: boolean) => callback(op, isLocal);
        props.model.authors.on("op", func);
    };

    return (
        <div style={{ margin: "20px auto", maxWidth: 800 }}>
            <MemberList members={members} onAuthorsOp={onAuthorsOp} style={{ textAlign: "right" }} />
            <FluidEditor
                sharedString={props.model.text}
                authors={props.model.authors}
                presenceManager={props.model.presenceManager}
            />
        </div>
    );
};
