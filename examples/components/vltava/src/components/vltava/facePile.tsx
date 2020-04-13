/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IFacepileProps,
    Facepile,
    OverflowButtonType,
    IFacepilePersona,
} from "office-ui-fabric-react/lib/Facepile";
import { PersonaInitialsColor } from "office-ui-fabric-react";
import { IVltavaUserDetails } from "./dataModel";

const facepileStyle: React.CSSProperties = {
    position: "absolute",
    top: 17,
    right : 20,
    cursor: "pointer",
};

interface IVltavaFacepileProps {
    users: IVltavaUserDetails[]
}

export const VltavaFacepile = (props: IVltavaFacepileProps) => {
    const facepilePersonas: IFacepilePersona[] = [];
    props.users.forEach((user: IVltavaUserDetails) => {
        const personaName = user.name;
        // Split the names on spaces and underscores
        const nameParts = personaName.split(" ")
            .reduce((acc: string[], val) => { acc.push(...val.split("_")); return acc; }, []);
        const imageInitials = nameParts.reduce((acc, val) => acc.concat(val.substr(0, 1)), "");
        // This is just a way to iterate through all colors in PersonaInitialColor in order
        const initialsColor =
            PersonaInitialsColor[
                PersonaInitialsColor[user.colorCode % Object.keys(PersonaInitialsColor).length]
            ];
        const persona: IFacepilePersona = {
            imageInitials,
            personaName,
            initialsColor,
        };

        facepilePersonas.push(persona);
    });

    const facepileProps: IFacepileProps = {
        personas: facepilePersonas,
        maxDisplayablePersonas: 3,
        overflowButtonType: OverflowButtonType.descriptive,
        overflowButtonProps: {
            ariaLabel: "More users",
            onClick: (ev: React.MouseEvent<HTMLButtonElement>) => alert("Todo: Implement This"),
        },
        ariaDescription: "To move through the items use left and right arrow keys.",
        ariaLabel: "Example list of Facepile personas",
    };

    return (
        <div style = {facepileStyle}>
            <Facepile {...facepileProps} />
        </div>
    );
};

const lastEditedFacepileStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 50,
    right : 50,
};

interface ILastEditedFacepileProps {
    user: IVltavaUserDetails;
    time: string;
}

export const LastEditedFacepile = (props: ILastEditedFacepileProps) => {
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
    };

    return (
        <div style = {lastEditedFacepileStyle}>
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
