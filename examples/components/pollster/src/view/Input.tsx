/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { KeyCodes } from "office-ui-fabric-react";

export interface InputProps {
    placeholder?: string;
    submitValue: (inputValue: string) => void;
}

// eslint-disable-next-line react/display-name
export const ControlledInput = React.memo((props: InputProps) => {
    const { placeholder, submitValue } = props;

    // eslint-disable-next-line no-null/no-null
    const inputRef = React.useRef<HTMLInputElement>(null);
    const [inputValue, updateInputValue] = React.useState<string>("");

    const onChangeQuestion = React.useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
        updateInputValue(ev.target.value);
    }, []);

    const onKeyDown = React.useCallback((ev: React.KeyboardEvent<HTMLInputElement>) => {
        if (ev.keyCode === KeyCodes.enter) {
            submitValue(inputRef.current.value);
            updateInputValue("");
        }
    }, []);

    return (
        <input
            value={inputValue}
            placeholder={placeholder || ""}
            onChange={onChangeQuestion}
            onKeyDown={onKeyDown}
            ref={inputRef}
        />
    );
});
