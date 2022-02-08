/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

export interface ICommandBoxCommand {
    friendlyName: string;
    exec: () => void;
}

export interface ICommandBoxProps {
    registerShowListener: (callback: () => void) => void;
    registerHideListener: (callback: () => void) => void;
    commands: ICommandBoxCommand[];
}

export const CommandBox: React.FC<ICommandBoxProps> = (props: ICommandBoxProps) => {
    const { registerShowListener, registerHideListener, commands } = props;
    const [show, setShow] = React.useState<boolean>(false);
    const [textFilter, setTextFilter] = React.useState<string>("");
    const filterRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        registerShowListener(() => { setShow(true); });
        registerHideListener(() => { setShow(false); });
    }, [ registerShowListener, registerHideListener ]);

    React.useEffect(() => {
        if (filterRef.current !== null) {
            const inputEl = filterRef.current;
            const filterCommands = () => {
                setTextFilter(inputEl.value);
            };
            inputEl.addEventListener("input", filterCommands);
            inputEl.focus();
            return () => {
                inputEl.removeEventListener("input", filterCommands);
            }
        }
    });

    const buildCommandElements = () => {
        if (textFilter === "") {
            return [];
        }

        const commandElements = commands
            .filter((command) => {
                return command.friendlyName.toLowerCase().startsWith(textFilter.toLowerCase());
            })
            .map((command) => {
                const doClick = () => {
                    command.exec();
                    setShow(false);
                };
                return <div key={ command.friendlyName } onClick={ doClick }>{ command.friendlyName }</div>;
            });
        return commandElements;
    }
    const commandElements = buildCommandElements();

    if (show) {
        return (
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                <div>
                    <input type="text" ref={ filterRef } />
                </div>
                <div>
                    { commandElements }
                </div>
            </div>
        );
    } else {
        return <></>;
    }
};
