/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { IMember } from "@fluidframework/fluid-static";

import { HasClientDebugger } from "../CommonProps";
import { AudienceMemberViewProps } from "./client-data-views";

// TODOs:
// - Special annotation for the member elected as the summarizer
// - History of audience changes

/**
 * {@link AudienceView} input props.
 */
export interface AudienceViewProps extends HasClientDebugger {
    /**
     * Callback to render data about an individual audience member.
     */
    onRenderAudienceMember(props: AudienceMemberViewProps): React.ReactElement;
}

/**
 * Displays information about the provided {@link @fluidframework/fluid-static#IServiceAudience | audience}.
 *
 * @param props - See {@link AudienceViewProps}.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
    const { audience, myself, onRenderAudienceMember } = props;

    const [allMembers, updateAllMembers] = useState<Map<string, IMember>>(audience.getMembers());

    useEffect(() => {
        function onUpdateMembers(): void {
            updateAllMembers(audience.getMembers());
        }

        audience.on("membersChanged", onUpdateMembers);

        return (): void => {
            audience.off("membersChanged", onUpdateMembers);
        };
    }, [audience]);

    const memberViews: React.ReactElement[] = [];
    for (const member of allMembers.values()) {
        memberViews.push(
            <li key={member.userId}>
                {onRenderAudienceMember({
                    audienceMember: member,
                    isMyself: member.userId === myself?.userId,
                })}
            </li>,
        );
    }

    return (
        <Stack
            styles={{
                root: {
                    height: "100%",
                },
            }}
        >
            <StackItem>
                <div className="audience-view-members-list">
                    <b>Audience members ({allMembers.size})</b>
                </div>
            </StackItem>
            <StackItem>
                <ul>{memberViews}</ul>
            </StackItem>
        </Stack>
    );
}
