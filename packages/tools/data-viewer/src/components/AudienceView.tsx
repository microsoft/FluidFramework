/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React, { useEffect, useState } from "react";

import { IMember, IServiceAudience } from "fluid-framework";

// eslint-disable-next-line import/no-unassigned-import
import "./AudienceView.css";

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

    // TODO: better than this :)
    const renderedMyself =
        myself === undefined ? <div>Cannot find myself!</div> : <MyselfView myself={myself} />;

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
            <AudienceCount audienceCount={allMembers.size + 1} />
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

    const connectionsPostfix =
        member.connections.length !== 1 ? ` (connections: ${member.connections.length})` : "";

    return <div>{`${member.userId}${connectionsPostfix}`}</div>;
}

interface AudienceCountProps {
    audienceCount: number;
}

function AudienceCount(props: AudienceCountProps): React.ReactElement {
    const { audienceCount } = props;
    return (
        <div>
            <b>Audience Members:</b> {audienceCount}
        </div>
    );
}
