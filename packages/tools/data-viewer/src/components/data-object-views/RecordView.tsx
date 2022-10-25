/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { RendererOptions } from "../../RendererOptions";
import { DynamicDataView } from "./DynamicDataView";

export interface RecordDataViewProps {
    /**
     * The data to display.
     */
    data: Record<string, unknown>;

    /**
     * {@inheritDoc RendererOptions}
     */
    sharedObjectRenderers: RendererOptions;
}

/**
 * Renders each property of {@link RecordDataViewProps.data} in a list.
 */
export function RecordDataView(props: RecordDataViewProps): React.ReactElement {
    const { data, sharedObjectRenderers } = props;

    const entries = Object.entries(data);
    return (
        <Stack>
            {entries.map(([key, value]) => (
                <StackItem key={key}>
                    <DynamicDataView data={value} sharedObjectRenderers={sharedObjectRenderers} />
                </StackItem>
            ))}
        </Stack>
    );
}
