/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IMember } from "@fluidframework/fluid-static";

/**
 * Input props describing a Fluid {@link @fluidframework/fluid-static#IMember | audience member}.
 */
export interface AudienceMemberViewProps {
    /**
     * The member of the audience to display.
     */
    audienceMember: IMember;

    /**
     * Whether or not {@link AudienceMemberViewProps.audienceMember} represents the local session user.
     */
    isMyself: boolean;
}

/**
 * Displays basic information about the provided {@link AudienceMemberViewProps.audienceMember}.
 */
export function AudienceMemberView(props: AudienceMemberViewProps): React.ReactElement {
    const { audienceMember, isMyself } = props;

    const mePostfix = isMyself ? " (me)" : "";

    const connectionsPostfix =
        audienceMember.connections.length !== 1
            ? ` (connections: ${audienceMember.connections.length})`
            : "";

    return (
        <div className="audience-view-member">{`${audienceMember.userId}${mePostfix}${connectionsPostfix}`}</div>
    );
}
