/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import uuid from "uuid";
import React from "react";

interface WaterParkToolbarViewProps {
    componentUrls: string[];
    onSelectOption: (componentUrl: string) => Promise<void>;
    toggleEditable?: () => void;
}

/**
 * WaterParkToolbar is an alternative toolbar to the one used by Spaces normally.  When an option is selected,
 * it uses the provided callback to notify the WaterPark.
 */
export const WaterParkToolbar: React.FC<WaterParkToolbarViewProps> =
    (props: WaterParkToolbarViewProps) => {
        const [errorText, setErrorText] = React.useState<string | undefined>(undefined);
        const datalistId = uuid();

        const datalistOptions = props.componentUrls.map((member) => {
            return <option value={ member } key={ member }></option>;
        });

        const inputRef = React.createRef<HTMLInputElement>();

        const pickComponent = () => {
            setErrorText(undefined);
            // eslint-disable-next-line no-null/no-null
            if (inputRef.current === null) {
                return;
            }
            const componentUrl = inputRef.current.value;
            if (componentUrl === undefined || componentUrl.length === 0) {
                inputRef.current.style.backgroundColor = "#fee";
            } else {
                props.onSelectOption(componentUrl).catch((error) => {
                    setErrorText(error.toString());
                });
            }
        };

        const inputKeyUpHandler = (event) => {
            if (event.key === "Enter") {
                pickComponent();
            }
        };

        const errorElement = errorText !== undefined
            ? <div>{ errorText }</div>
            : undefined;

        return (
            <div className="waterpark-toolbar">
                <datalist id={datalistId}>
                    { datalistOptions }
                </datalist>
                <input
                    ref={ inputRef }
                    list={ datalistId }
                    type="text"
                    placeholder="@fluid-example/component-name@version"
                    style={{ width: "100%" }}
                    onKeyUp={ inputKeyUpHandler }
                />
                <button onClick={ pickComponent }>Add Component</button>
                <button onClick={ props.toggleEditable }>Toggle Edit</button>
                { errorElement }
            </div>
        );
    };
