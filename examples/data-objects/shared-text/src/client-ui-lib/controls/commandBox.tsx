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
    /**
     * FlowView wants to summon the command box, easiest way to stitch together is by plumbing a callback.
     */
    registerShowListener: (callback: () => void) => void;
    /**
     * The CommandBox controls its own dismissal.  Observers can register a callback to learn when it dismisses.
     */
    dismissCallback: () => void;
    /**
     * The library of commands that the CommandBox will present to the user.
     */
    commands: ICommandBoxCommand[];
}

export const CommandBox: React.FC<ICommandBoxProps> = (props: ICommandBoxProps) => {
    const { registerShowListener, dismissCallback, commands } = props;
    const [show, setShow] = React.useState<boolean>(false);
    const [matchingCommands, setMatchingCommands] = React.useState<ICommandBoxCommand[]>([]);
    const [arrowedCommand, setArrowedCommand] = React.useState<number | undefined>(undefined);

    const filterRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        registerShowListener(() => { setShow(true); });
    }, [registerShowListener]);

    React.useEffect(() => {
        if (filterRef.current !== null) {
            const inputEl = filterRef.current;
            const filterCommands = () => {
                // todo: actually compare match of filtered commands and only reset if different
                setArrowedCommand(undefined);
                setMatchingCommands(commands.filter((command) => {
                    return command.friendlyName.toLowerCase().startsWith(inputEl.value.toLowerCase());
                }));
            };
            inputEl.addEventListener("input", filterCommands);
            inputEl.focus();
            return () => {
                inputEl.removeEventListener("input", filterCommands);
            };
        }
    });

    const dismissCommandBox = () => {
        setMatchingCommands([]);
        setShow(false);
        dismissCallback();
    };

    const keydownHandler = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
            const filterValue = filterRef.current?.value;
            const exactMatchingCommand = filterValue !== undefined
                ? commands.find(
                    (command) => filterValue.toLowerCase() === command.friendlyName.toLowerCase(),
                )
                : undefined;

            if (arrowedCommand !== undefined) {
                matchingCommands[arrowedCommand].exec();
                dismissCommandBox();
            } else if (exactMatchingCommand !== undefined) {
                exactMatchingCommand.exec();
                dismissCommandBox();
            }
        }
    };

    const commandElements = matchingCommands.map((command, index) => {
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

    if (show) {
        return (
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                <div>
                    <input type="text" ref={ filterRef } onKeyDown={ keydownHandler } onKeyPress={ keypressHandler }/>
                </div>
                {
                    commandElements.length > 0
                    ? (
                        <div style={{ width: "300px", backgroundColor: "#fff", border: "1px solid #000" }}>
                            { commandElements }
                        </div>
                    )
                    : <></>
                }
            </div>
        );
    } else {
        return <></>;
    }
};
