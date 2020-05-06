/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as uuid from "uuid";
import * as React from "react";

interface ExternalComponentLoaderToolbarProps {
    datalistMembers: string[];
    onSelectOption: (option: string) => Promise<void>;
    toggleEditable?: () => void;
}

export const ExternalComponentLoaderToolbar: React.FC<ExternalComponentLoaderToolbarProps> =
    (props: ExternalComponentLoaderToolbarProps) => {
        const [errorText, setErrorText] = React.useState<string | undefined>(undefined);
        const datalistId = uuid();

        const datalistOptions = props.datalistMembers.map((member) => {
            return <option value={ member } key={ member }></option>;
        });

        const inputRef = React.createRef<HTMLInputElement>();

        const pickComponent = () => {
            setErrorText(undefined);
            // eslint-disable-next-line no-null/no-null
            if (inputRef.current === null) {
                return;
            }
            const picked = inputRef.current.value;
            if (picked === undefined || picked.length === 0) {
                inputRef.current.style.backgroundColor = "#fee";
            } else {
                props.onSelectOption(picked).catch((error) => {
                    setErrorText(`Error in picking component: ${error}`);
                });
            }
        };

        const inputKeyUpHandler = (event) => {
            console.log(event.key);
            if (event.key === "Enter") {
                pickComponent();
            }
        };

        const errorElement = errorText !== undefined
            ? <div>{ errorText }</div>
            : undefined;

        return (
            <div className="external-component-loader-toolbar">
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
