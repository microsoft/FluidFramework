/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { IMember, IServiceAudience } from "@fluidframework/fluid-static";

// TODOs:
// - Special annotation for the member elected as the summarizer

/**
 * {@link AudienceView} input props.
 */
export interface AudienceViewProps {
    /**
     * Audience member infor for the session user.
     */
    myself: IMember | undefined;

    /**
     * Audience information.
     */
    audience: IServiceAudience<IMember>;
}

/**
 * Displays information about the provided {@link @fluidframework/fluid-static#IServiceAudience | audience}.
 *
 * @param props - See {@link AudienceViewProps}.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
    const { audience, myself } = props;

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
            <li key={member.userId}>
                <MemberView member={member} myself={myself} />
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
            <AudienceCount audienceCount={allMembers.size} />
            <ul>{renderedOthers}</ul>
        </Stack>
    );
}

interface MemberViewProps {
    member: IMember;

    /**
     * Audience member infor for the session user.
     */
    myself: IMember | undefined;
}

function MemberView(props: MemberViewProps): React.ReactElement {
    const { member, myself } = props;

    const mePostfix = member.userId === myself?.userId ? " (me)" : "";

    const connectionsPostfix =
        member.connections.length !== 1 ? ` (connections: ${member.connections.length})` : "";

    return (
        <div className="audience-view-member">{`${member.userId}${mePostfix}${connectionsPostfix}`}</div>
    );
}

interface AudienceCountProps {
    audienceCount: number;
}

function AudienceCount(props: AudienceCountProps): React.ReactElement {
    const { audienceCount } = props;
    return (
        <div className="audience-view-members-list">
            <b>Audience members:</b> {audienceCount}
        </div>
    );
}
