/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { IOptionPicker } from "@fluid-example/multiview-option-picker-interface";

interface IOptionPickerViewProps {
    model: IOptionPicker;
}

export const OptionPickerView: React.FC<IOptionPickerViewProps> = (props: IOptionPickerViewProps) => {
    const [optionValue, setOptionValue] = React.useState(props.model.value);

    React.useEffect(() => {
        const onOptionChanged = () => {
            setOptionValue(props.model.value);
        };
        props.model.on("optionChanged", onOptionChanged);
        return () => {
            props.model.off("optionChanged", onOptionChanged);
        };
    }, [props.model]);

    return (
        <div>
            <span style={{ fontSize: 50 }}>{optionValue}</span>
            <button onClick={props.model.setOptionValue}>Set Value</button>
        </div>
    );
};
