/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IFacepileProps,
    Facepile,
    IFacepilePersona,
} from "office-ui-fabric-react/lib/Facepile";
import { PersonaInitialsColor } from "office-ui-fabric-react";

const facepileStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 50,
    right : 50,
};

interface ILastEditedFacepileProps {
    user: string;
    time: string;
}

export const LastEditedFacepile = (props: ILastEditedFacepileProps) => {
    const personaName = props.user;
    let count = 0;
    // Split the names on spaces and underscores
    const nameParts = personaName.split(" ")
        .reduce((acc: string[], val) => { acc.push(...val.split("_")); return acc; }, []);
    const imageInitials = nameParts.reduce((acc, val) => acc.concat(val.substr(0, 1)), "");
    // This is just a way to iterate through all colors in PersonaInitialColor in order
    const initialsColor =
        PersonaInitialsColor[
            PersonaInitialsColor[count++ % Object.keys(PersonaInitialsColor).length]
        ];
    const persona: IFacepilePersona = {
        imageInitials,
        personaName,
        initialsColor,
    };

    const facepileProps: IFacepileProps = {
        personas: [persona],
        maxDisplayablePersonas: 1,
    };

    return (
        <div style = {facepileStyle}>
            <div
                style={{
                    width: "100%",
                    textAlign: "left",
                    borderBottom:"1px solid lightgray",
                    boxSizing:"border-box"}}
            >
                <h3>
                    Last Edited Details
                </h3>
            </div>
            <br />
            <Facepile {...facepileProps} />
            <br />
            <div>
                {props.time}
            </div>
        </div>
    );
};
