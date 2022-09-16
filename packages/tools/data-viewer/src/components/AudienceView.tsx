/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
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

    // TODO: can we guarantee this is present somehow?
    const [myself] = useState<IMember | undefined>(audience.getMyself());
    const [otherMembers, updateOtherMembers] = useState<Map<string, IMember>>(
        audience.getMembers(),
    );

    useEffect(() => {
        function onMemberAdded(clientId: string, newMember: IMember): void {
            otherMembers.set(newMember.userId, newMember);
            updateOtherMembers(otherMembers);
        }

        function onMemberRemoved(clientId: string, removedMember: IMember): void {
            otherMembers.delete(removedMember.userId);
            updateOtherMembers(otherMembers);
        }

        audience.on("memberAdded", onMemberAdded);
        audience.on("memberRemoved", onMemberRemoved);

        return () => {
            audience.off("memberAdded", onMemberAdded);
            audience.off("memberRemoved", onMemberRemoved);
        };
    }, [audience]);

    // TODO: better than this :)
    const renderedMyself =
        myself === undefined ? <div>Cannot find myself!</div> : <MyselfView myself={myself} />;

    const renderedOthers: React.ReactElement[] = [];
    for (const member of otherMembers.values()) {
        renderedOthers.push(
            <li key={member.userId}>
                <OtherMemberView member={member} />
            </li>,
        );
    }

    return (
        <div>
            <AudienceCount audienceCount={otherMembers.size + 1} />
            <hr />
            {renderedMyself}
            <hr />
            <ul>{renderedOthers}</ul>
        </div>
    );
}

interface MyselfViewProps {
    myself: IMember;
}

function MyselfView(props: MyselfViewProps): React.ReactElement {
    const { myself } = props;
    return <div>{myself.userId} (ME)</div>;
}

interface OtherMemberViewProps {
    member: IMember;
}

function OtherMemberView(props: OtherMemberViewProps): React.ReactElement {
    const { member } = props;
    return <div>{member.userId}</div>;
}

interface AudienceCountProps {
    audienceCount: number;
}

function AudienceCount(props: AudienceCountProps): React.ReactElement {
    const { audienceCount } = props;
    return <div>Audience Members: {audienceCount}</div>;
}
