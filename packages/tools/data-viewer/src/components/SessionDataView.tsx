/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "office-ui-fabric-react";
import React from "react";

import { AudienceView, AudienceViewProps } from "./AudienceView";
import { ContainerDataView, ContainerDataViewProps } from "./ContainerDataView";

/**
 * {@link SessionDataView} input props.
 */
export type SessionDataViewProps = AudienceViewProps & ContainerDataViewProps;

/**
 * Displays information about the provided container and its audience.
 *
 * @param props - See {@link SessionDataViewProps}.
 */
export function SessionDataView(props: SessionDataViewProps): React.ReactElement {
    const { containerId, container, audience } = props;

    return (
        <Stack horizontal tokens={{childrenGap: 25}}>
            <ContainerDataView containerId={containerId} container={container} />
            <AudienceView audience={audience} />
        </Stack>
    );
}
