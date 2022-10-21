import { Stack } from "@fluentui/react";
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
        function updateValue(): void {
            setValue(sharedCounter.value);
        }

        sharedCounter.on("valueChanged", updateValue);

        return (): void => {
            sharedCounter.off("valueChanged", updateValue);
        };
    }, [sharedCounter, setValue]);

    return (
        <Stack>
            <Stack.Item>
                <b>SharedCounter</b>
            </Stack.Item>
            <Stack.Item>Value: {value}</Stack.Item>
        </Stack>
    );
}
