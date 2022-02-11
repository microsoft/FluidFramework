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

export const CommandBox: React.FC<ICommandBoxProps> = (props: ICommandBoxProps) => {
    const { registerShowListener, doneHandler, commands } = props;
    const [show, setShow] = React.useState<boolean>(false);
    const [textFilter, setTextFilter] = React.useState<string>("");
    const [arrowedCommand, setArrowedCommand] = React.useState<number | undefined>(undefined);
    const filterRef = React.useRef<HTMLInputElement>(null);
    React.useEffect(() => {
        registerShowListener(() => { setShow(true); });
    }, [ registerShowListener ]);

    React.useEffect(() => {
        if (filterRef.current !== null) {
            const inputEl = filterRef.current;
            const filterCommands = () => {
                // todo: actually compare match of filtered commands and only reset if different
                setArrowedCommand(undefined);
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

    const getMatchingCommands = () => commands.filter((command) => {
        return command.friendlyName.toLowerCase().startsWith(textFilter.toLowerCase());
    });

    const keydownHandler = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const matchingCommands = getMatchingCommands();
        if (e.key === "Escape") {
            dismissCommandBox();
        } else if (e.key === "ArrowDown") {
            if (arrowedCommand === undefined) {
                if (matchingCommands.length > 0) {
                    setArrowedCommand(0);
                }
            } else {
                setArrowedCommand((arrowedCommand + 1) % matchingCommands.length);
            }
            e.preventDefault();
        } else if (e.key === "ArrowUp") {
            if (arrowedCommand === undefined) {
                if (matchingCommands.length > 0) {
                    setArrowedCommand(matchingCommands.length - 1);
                }
            } else {
                setArrowedCommand((arrowedCommand - 1) % matchingCommands.length);
            }
            e.preventDefault();
        }
    };

    const keypressHandler = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            if (arrowedCommand !== undefined) {
                getMatchingCommands()[arrowedCommand].exec();
                dismissCommandBox();
            }/* else if (textbox contents string match a known command) {
                command.exec();
                dismissCommandBox();
            }*/
        }
    };

    const buildCommandElements = () => {
        if (textFilter === "") {
            return [];
        }

        const commandElements = getMatchingCommands().map((command, index) => {
                const clickCommand = () => {
                    command.exec();
                    dismissCommandBox();
                };

                if (index === arrowedCommand) {
                    return (
                        <div key={ command.friendlyName } onClick={ clickCommand } style={{ backgroundColor: "#ccc" }}>
                            { command.friendlyName }
                        </div>
                    );
                } else {
                    return <div key={ command.friendlyName } onClick={ clickCommand }>{ command.friendlyName }</div>;
                }
            });

        return commandElements;
    }
    const commandElements = buildCommandElements();

    if (show) {
        return (
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                <div>
                    <input type="text" ref={ filterRef } onKeyDown={ keydownHandler } onKeyPress={ keypressHandler }/>
                </div>
                <div style={{ backgroundColor: "#fff", border: "1px solid #000" }}>
                    { commandElements }
                </div>
            </div>
        );
    } else {
        return <></>;
    }
};
