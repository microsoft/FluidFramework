/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from 'react';
import {
    IFacepileProps,
    Facepile,
    OverflowButtonType,
    IFacepilePersona,
} from 'office-ui-fabric-react/lib/Facepile';

enum PersonaInitialsColor {
    lightBlue = 0,
    blue = 1,
    darkBlue = 2,
    teal = 3,
    lightGreen = 4,
    green = 5,
    darkGreen = 6,
    lightPink = 7,
    pink = 8,
    magenta = 9,
    purple = 10,
    black = 11,
    orange = 12,
    red = 13,
    darkRed = 14,
    transparent = 15,
    violet = 16,
    lightRed = 17,
    gold = 18,
    burgundy = 19,
    warmGray = 20,
    coolGray = 21,
    gray = 22,
    cyan = 23,
    rust = 24
}

const facepilePersonas: IFacepilePersona[] = [
    {
        imageInitials: 'AL',
        personaName: 'Alex Lundberg2',
        initialsColor: PersonaInitialsColor.orange
    },
    {
        imageInitials: 'RK',
        personaName: 'Roko Kolar2',
        initialsColor: PersonaInitialsColor.pink
    },
    {
        imageInitials: 'CB',
        personaName: 'Christian Bergqvist2',
        initialsColor: PersonaInitialsColor.purple
    },
    {
        imageInitials: 'VL',
        personaName: 'Valentina Lovric2',
        initialsColor: PersonaInitialsColor.red
    },
    {
        imageInitials: 'MS',
        personaName: 'Maor Sharett2',
        initialsColor: PersonaInitialsColor.teal
    },
    {
        imageInitials: 'VL',
        personaName: 'Another A Name',
        initialsColor: PersonaInitialsColor.blue
    },
    {
        imageInitials: 'MS',
        personaName: 'Another A Name (So Many A names!)',
        initialsColor: PersonaInitialsColor.darkBlue
    },
];

const facepileProps: IFacepileProps = {
    personas: facepilePersonas,
    maxDisplayablePersonas: 3,
    overflowButtonType: OverflowButtonType.descriptive,
    overflowButtonProps: {
        ariaLabel: 'More users',
        onClick: (ev: React.MouseEvent<HTMLButtonElement>) => alert('Todo: Implement This')
    },
    ariaDescription: 'To move through the items use left and right arrow keys.',
    ariaLabel: 'Example list of Facepile personas',
};

const facepileStyle: React.CSSProperties = {
    position: "absolute",
    top: 17,
    right : 20,
};

export const FacepileOverflowExample = () => {
    return (
        <div style = {facepileStyle}>
            <Facepile {...facepileProps} />
        </div>
    );
}
