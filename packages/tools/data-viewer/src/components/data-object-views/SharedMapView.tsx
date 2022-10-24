/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "@fluentui/react";
import React from "react";

import { SharedMap } from "@fluidframework/map";

import { RenderChild } from "../../RendererOptions";

/**
 * {@link SharedMapView} input props.
 */
export interface SharedMapViewProps {
    /**
     * The shared map whose contents will be displayed.
     */
    sharedMap: SharedMap;

    renderChild: RenderChild;
}

/**
 * Default {@link @fluidframework/map#SharedMap} viewer.
 */
export function SharedMapView(props: SharedMapViewProps): React.ReactElement {
    const { sharedMap } = props;

    const [entries, setEntries] = React.useState<[string, unknown][]>([...sharedMap.entries()]);

    React.useEffect(() => {
        function updateEntries(): void {
            setEntries([...sharedMap.entries()]);
        }

        sharedMap.on("valueChanged", updateEntries);

        return (): void => {
            sharedMap.off("valueChanged", updateEntries);
        };
    }, []);

    return (
        <Stack>
            <Stack.Item>
                <b>SharedMap</b>
            </Stack.Item>
            <Stack.Item>Entry count: {entries.length}</Stack.Item>
            <Stack.Item>TODO: visualize entries</Stack.Item>
        </Stack>
    );
}
