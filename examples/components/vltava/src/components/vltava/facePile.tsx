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

const facepileStyle: React.CSSProperties = {
    position: "absolute",
    top: 17,
    right : 20,
    cursor: "pointer",
};

interface IVltavaFacepileProps {
    users: string[]
}

export const VltavaFacepile = (props: IVltavaFacepileProps) => {
    const facepilePersonas: IFacepilePersona[] = [];
    let count = 0;
    props.users.forEach((personaName) => {
        const imageInitials = `${personaName.substring(0,1)}${personaName.split(" ")[1].substring(0,1)}`;
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
