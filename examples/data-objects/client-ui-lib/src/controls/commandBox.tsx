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
    doneHandler: () => void;
    commands: ICommandBoxCommand[];
}

// hide on enter
export const CommandBox: React.FC<ICommandBoxProps> = (props: ICommandBoxProps) => {
    const { registerShowListener, doneHandler, commands } = props;
    const [show, setShow] = React.useState<boolean>(false);
    const [textFilter, setTextFilter] = React.useState<string>("");
    const filterRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        registerShowListener(() => { setShow(true); });
    }, [ registerShowListener ]);

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

    const dismissCommandBox = () => {
        setTextFilter("");
        setShow(false);
        doneHandler();
    };

    const keydownHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            dismissCommandBox();
        }
    };

    React.useEffect(() => {
        if (show) {
            document.addEventListener("keydown", keydownHandler);
        } else {
            document.removeEventListener("keydown", keydownHandler);
        }
        return () => {
            document.removeEventListener("keydown", keydownHandler);
        };
    }, [show]);

    const buildCommandElements = () => {
        if (textFilter === "") {
            return [];
        }

        const commandElements = commands
            .filter((command) => {
                return command.friendlyName.toLowerCase().startsWith(textFilter.toLowerCase());
            })
            .map((command) => {
                const clickCommand = () => {
                    command.exec();
                    dismissCommandBox();
                };
                return <div key={ command.friendlyName } onClick={ clickCommand }>{ command.friendlyName }</div>;
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
