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
    React.useEffect(() => {
        registerShowListener(() => { setShow(true); });
        registerHideListener(() => { setShow(false); });
    }, [registerShowListener, registerHideListener]);
    const commandElements = commands.map((value) => {
        return <div key={ value.friendlyName } onClick={ value.exec }>{ value.friendlyName }</div>;
    });
    console.log(commands);

    if (show) {
        return (
            <div style={{ position: "absolute", width: "100%", height: "100%" }}>
                { commandElements }
            </div>
        );
    } else {
        return <></>;
    }
};
