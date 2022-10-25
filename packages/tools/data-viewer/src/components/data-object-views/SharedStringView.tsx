/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack, StackItem } from "@fluentui/react";
import React from "react";

import { SharedString } from "@fluidframework/sequence";

/**
 * {@link SharedStringView} input props.
 */
export interface SharedStringViewProps {
    /**
     * {@link @fluidframework/sequence#SharedString} whose data will be displayed.
     */
    sharedString: SharedString;
}

/**
 * Default {@link @fluidframework/sequence#SharedString} viewer.
 */
export function SharedStringView(props: SharedStringViewProps): React.ReactElement {
    const { sharedString } = props;

    const [text, setText] = React.useState<string>(sharedString.getText());

    React.useEffect(() => {
        function updateText(): void {
            const newText = sharedString.getText();
            setText(newText);
        }

        sharedString.on("sequenceDelta", updateText);

        return (): void => {
            sharedString.off("sequenceDelta", updateText);
        };
    }, []);

    return (
        <Stack>
            <StackItem>
                <b>SharedString</b>
            </StackItem>
            <StackItem>{text}</StackItem>
        </Stack>
    );
}
