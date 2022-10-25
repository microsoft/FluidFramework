/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { SharedCounter } from "@fluidframework/counter";

/**
 * {@link SharedCounterView} input props.
 */
export interface SharedCounterViewProps {
    sharedCounter: SharedCounter;
}

/**
 * Default {@link @fluidframework/counter#SharedCounter} viewer.
 */
export function SharedCounterView(props: SharedCounterViewProps): React.ReactElement {
    const { sharedCounter } = props;

    const [value, setValue] = React.useState<number>(sharedCounter.value);

    React.useEffect(() => {
        function updateValue(delta: number, newValue: number): void {
            setValue(newValue);
        }

        sharedCounter.on("incremented", updateValue);

        return (): void => {
            sharedCounter.off("incremented", updateValue);
        };
    }, [sharedCounter, setValue]);

    return (
        <Stack>
            <StackItem>
                <b>SharedCounter</b>
            </StackItem>
            <StackItem>Value: {value}</StackItem>
        </Stack>
    );
}
