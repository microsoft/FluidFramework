/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
    IFacepileProps,
    Facepile,
    IFacepilePersona,
} from "office-ui-fabric-react/lib/Facepile";
import { PersonaInitialsColor } from "office-ui-fabric-react";
import { IVltavaUserDetails } from "./dataModel";

const grayBoxStyle: React.CSSProperties = {
    position: "absolute",
    top: 55,
    right: 5,
    width: 250,
    height: 35,
    background:"#3D3D3D",
    overflow: "hidden",
    boxSizing: "border-box",
};

const whiteBoxStyle: React.CSSProperties = {
    position: "absolute",
    top: 85,
    right: 5,
    width: 250,
    height: 100,
    background:"white",
    overflow: "hidden",
    boxSizing: "border-box",
    border: "1px solid lightgray",
};

const lastEditByStyle: React.CSSProperties = {
    position: "relative",
    top: 5,
    color: "white",
    fontFamily: "Calibri",
    fontSize: 16,
    textAlign: "center",
};

const facePileStyle: React.CSSProperties = {
    position: "absolute",
    top: 15,
    left: 20,
};

const lastEditedTimeStyle: React.CSSProperties = {
    position: "relative",
    top: 65,
    color: "#505050",
    fontFamily: "Calibri",
    fontSize: 15,
    textAlign: "center",
};

interface ILastEditedDisplayProps {
    user?: IVltavaUserDetails;
    time?: string;
}

export const LastEditedDisplay = (props: ILastEditedDisplayProps) => {
    if (props.user === undefined || props.time === undefined) {
        return (
            <div></div>
        );
    }

    const personaName = props.user.name;
    // Split the names on spaces and underscores
    const nameParts = personaName.split(" ")
        .reduce((acc: string[], val) => { acc.push(...val.split("_")); return acc; }, []);
    const imageInitials = nameParts.reduce((acc, val) => acc.concat(val.substr(0, 1)), "");
    // This is just a way to iterate through all colors in PersonaInitialColor in order
    const initialsColor =
        PersonaInitialsColor[
            PersonaInitialsColor[props.user.colorCode % Object.keys(PersonaInitialsColor).length]
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
        <div>
            <div style = {grayBoxStyle}>
                <div style = {lastEditByStyle}>
                    Last Edit By
                </div>
            </div>
            <div style = {whiteBoxStyle}>
                <div style = {facePileStyle}>
                    <Facepile {...facepileProps} />
                </div>
                <div style = {lastEditedTimeStyle}>
                    {props.time}
                </div>
            </div>
        </div>
    );
};
