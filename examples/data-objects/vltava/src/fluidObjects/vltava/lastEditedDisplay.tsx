/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
    IFacepileProps,
    Facepile,
    IFacepilePersona,
} from "office-ui-fabric-react/lib/Facepile";
import { PersonaInitialsColor } from "office-ui-fabric-react";
import { IVltavaLastEditedState } from "./dataModel";

const lastEditedBoxStyle: React.CSSProperties = {
    position: "relative",
    top: 20,
    left: -210,
    height: 110,
    width: 220,
    color: "#505050",
    background: "white",
    fontSize: 15,
    fontFamily: "Calibri",
    textAlign: "center",
    border: "1px solid darkgray",
};

const lastEditByStyle: React.CSSProperties = {
    color: "white",
    background: "#3D3D3D",
    padding: "3px",
};

interface ILastEditedDisplayProps {
    lastEditedState?: IVltavaLastEditedState;
}

export const LastEditedDisplay = (props: ILastEditedDisplayProps) => {
    if (props.lastEditedState === undefined) {
        return (
            <div />
        );
    }

    const personaName = props.lastEditedState.user.name;
    // Split the names on spaces and underscores
    const nameParts = personaName.split(" ")
        .reduce((acc: string[], val) => { acc.push(...val.split("_")); return acc; }, []);
    const imageInitials = nameParts.reduce((acc, val) => acc.concat(val.substr(0, 1)), "");
    // This is just a way to iterate through all colors in PersonaInitialColor in order
    const initialsColor =
        PersonaInitialsColor[
        PersonaInitialsColor[props.lastEditedState.user.colorCode % Object.keys(PersonaInitialsColor).length]
        ];
    const persona: IFacepilePersona = {
        imageInitials,
        personaName,
        initialsColor,
    };

    const facepileProps: IFacepileProps = {
        personas: [persona],
        maxDisplayablePersonas: 1,
        ariaDescription: "Displays the last edited user and time of the document.",
        ariaLabel: "Last Edited Details",
    };

    return (
        <div style={lastEditedBoxStyle}>
            <div style={lastEditByStyle}>
                Last Edit By
            </div>
            <div style={{ padding: "10px 30px" }}>
                <Facepile {...facepileProps} />
            </div>
            {props.lastEditedState.time}
        </div>
    );
};
