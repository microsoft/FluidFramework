/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { IMember, IServiceAudience } from "@fluidframework/fluid-static";

import { AudienceMemberViewProps } from "./client-data-views";

// TODOs:
// - Special annotation for the member elected as the summarizer

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

    const renderedOthers: React.ReactElement[] = [];
    for (const member of allMembers.values()) {
        renderedOthers.push(
            <StackItem key={member.userId}>
                {onRenderAudienceMember({
                    audienceMember: member,
                    isMyself: member.userId === myself?.userId,
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
                    <b>Audience members:</b> {allMembers.size}
                </div>
            </StackItem>
            <StackItem>
                <Stack>{renderedOthers}</Stack>
            </StackItem>
        </Stack>
    );
}
