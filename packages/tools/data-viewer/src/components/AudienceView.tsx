/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React, { useEffect, useState } from "react";

import { IMember, IServiceAudience } from "fluid-framework";

/**
 * {@link AudienceView} input props.
 */
export interface AudienceViewProps {
    /**
     * Audience information.
     */
    audience: IServiceAudience<IMember>;
}

/**
 * Displays information about the provided {@link fluid-framework#IServiceAudience | audience}.
 *
 * @param props - See {@link AudienceViewProps}.
 */
export function AudienceView(props: AudienceViewProps): React.ReactElement {
    const { audience } = props;

    const [myself, updateMyself] = useState<IMember | undefined>(audience.getMyself());
    const [allMembers, updateAllMembers] = useState<Map<string, IMember>>(audience.getMembers());

    useEffect(() => {
        function onUpdateMembers(): void {
            updateMyself(audience.getMyself());
            updateAllMembers(audience.getMembers());
        }

        audience.on("membersChanged", onUpdateMembers);

        return (): void => {
            audience.off("membersChanged", onUpdateMembers);
        };
    }, [audience]);

    const renderedOthers: React.ReactElement[] = [];
    for (const member of allMembers.values()) {
        if (member.userId !== myself?.userId) {
            renderedOthers.push(
                <li key={member.userId}>
                    <OtherMemberView member={member} />
                </li>,
            );
        }
    }

    return (
        <div className="audience-view">
            <h2>Audience</h2>
            <Stack>
                <MyselfView myself={myself} />
                <AudienceCount audienceCount={allMembers.size} />
                <ul>{renderedOthers}</ul>
            </Stack>
        </div>
    );
}

interface MyselfViewProps {
    myself: IMember | undefined;
}

function MyselfView(props: MyselfViewProps): React.ReactElement {
    const { myself } = props;
    return (
        <div className="audience-view-myself">
            <b>Me:</b> {myself?.userId ?? "Unable to find my ID in audience ☹"}
        </div>
    );
}

interface OtherMemberViewProps {
    member: IMember;
}

function OtherMemberView(props: OtherMemberViewProps): React.ReactElement {
    const { member } = props;

    const connectionsPostfix =
        member.connections.length !== 1 ? ` (connections: ${member.connections.length})` : "";

    return <div className="audience-view-member">{`${member.userId}${connectionsPostfix}`}</div>;
}

interface AudienceCountProps {
    audienceCount: number;
}

function AudienceCount(props: AudienceCountProps): React.ReactElement {
    const { audienceCount } = props;
    return (
        <div className="audience-view-members-list">
            <b>Audience Members:</b> {audienceCount}
        </div>
    );
}
