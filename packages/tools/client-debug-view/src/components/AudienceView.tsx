/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { IClient } from "@fluidframework/protocol-definitions";

import { combineMembersWithMultipleConnections } from "../Audience";
import { HasClientDebugger } from "../CommonProps";
import { useMyClientConnection, useMyClientId } from "../ReactHooks";
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
    const { clientDebugger, onRenderAudienceMember } = props;

    const myClientId = useMyClientId(clientDebugger);
    const myClientConnection = useMyClientConnection(clientDebugger);

    const [allAudienceMembers, setAllAudienceMembers] = useState<Map<string, IClient>>(
        clientDebugger.getAudienceMembers(),
    );

    useEffect(() => {
        function onAudienceMembersChanged(): void {
            setAllAudienceMembers(clientDebugger.getAudienceMembers());
        }

        clientDebugger.on("audienceMemberAdded", onAudienceMembersChanged);
        clientDebugger.on("audienceMemberRemoved", onAudienceMembersChanged);

        return (): void => {
            clientDebugger.off("audienceMemberAdded", onAudienceMembersChanged);
            clientDebugger.off("audienceMemberRemoved", onAudienceMembersChanged);
        };
    }, [clientDebugger, setAllAudienceMembers]);

    const transformedAudience = combineMembersWithMultipleConnections(allAudienceMembers);

    const memberViews: React.ReactElement[] = [];
    for (const member of transformedAudience.values()) {
        memberViews.push(
            <StackItem key={member.userId}>
                {onRenderAudienceMember({
                    audienceMember: member,
                    myClientId,
                    myClientConnection,
                })}
            </StackItem>,
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
                    <b>Audience members ({allAudienceMembers.size})</b>
                </div>
            </StackItem>
            <StackItem>
                <Stack>{memberViews}</Stack>
            </StackItem>
        </Stack>
    );
}
