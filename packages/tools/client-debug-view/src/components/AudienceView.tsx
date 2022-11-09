/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { IMember, IServiceAudience } from "@fluidframework/fluid-static";

import { AudienceMemberViewProps } from "./client-data-views";
import { AudienceHistory } from "./ClientDebugView";

// TODOs:
// - Special annotation for the member elected as the summarizer
// - History of audience changes

/**
 * {@link AudienceView} input props.
 */
export interface AudienceViewProps {
    /**
     * Audience member info for the session user.
     */
    myself: IMember | undefined;

    /**
     * Audience information.
     */
    audience: IServiceAudience<IMember>;

    /**
     * Audience history to show member come and go records.
     */
    history: AudienceHistory[];

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
    const { audience, history, myself, onRenderAudienceMember } = props;

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

    const historyViews: React.ReactElement[] = [];
    for (const h of history.values()) {
        historyViews.push(
            <ul key={h.audienceMemberId}> <li>
                <b>Id: </b>{h.audienceMemberId}
                <br /><b>Time: </b> {new Date(h.timestamp).toDateString()}
                <br /><b>Type: </b> {h.type}</li>
            </ul>
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
            <StackItem>
                <div className="history-list">
                    <b>History</b>
                </div>
            </StackItem>
            <ul>{historyViews}</ul>
        </Stack>
    );
}
