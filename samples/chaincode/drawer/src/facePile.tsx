/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
/* eslint-disable import/no-internal-modules */
import { IFacepileProps, Facepile, OverflowButtonType, IFacepilePersona } from "office-ui-fabric-react/lib/Facepile";
import { Dropdown, IDropdownOption } from "office-ui-fabric-react/lib/Dropdown";
import { Slider } from "office-ui-fabric-react/lib/Slider";
import { PersonaInitialsColor } from "office-ui-fabric-react/lib/Persona";
/* eslint-enable import/no-internal-modules */

export const facepilePersonas: IFacepilePersona[] = [
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        personaName: "Annie Lindqvist",
        data: "50%",
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        personaName: "Aaron Reid",
        data: "$1,000",
    },
    {
        personaName: "Alex Lundberg",
        data: "75%",
        onClick: (ev: React.MouseEvent<HTMLElement>, persona: IFacepilePersona) =>
            alert(`You clicked on ${persona.personaName}. Extra data: ${persona.data}`),
    },
    {
        personaName: "Roko Kolar",
        data: "4 hrs",
    },
    {
        imageInitials: "CB",
        personaName: "Christian Bergqvist",
        initialsColor: PersonaInitialsColor.green,
        data: "25%",
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "VL",
        personaName: "Valentina Lovric",
        initialsColor: PersonaInitialsColor.lightBlue,
        data: "Emp1234",
        onClick: (ev: React.MouseEvent<HTMLElement>, persona: IFacepilePersona) =>
            alert(`You clicked on ${persona.personaName}. Extra data: ${persona.data}`),
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "MS",
        personaName: "Maor Sharett",
        initialsColor: PersonaInitialsColor.lightGreen,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "PV",
        personaName: "Annie Lindqvist2",
        initialsColor: PersonaInitialsColor.lightPink,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "AR",
        personaName: "Aaron Reid2",
        initialsColor: PersonaInitialsColor.magenta,
        data: "Emp1234",
        onClick: (ev: React.MouseEvent<HTMLElement>, persona: IFacepilePersona) =>
            alert(`You clicked on ${persona.personaName}. Extra data: ${persona.data}`),
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "AL",
        personaName: "Alex Lundberg2",
        initialsColor: PersonaInitialsColor.orange,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "RK",
        personaName: "Roko Kolar2",
        initialsColor: PersonaInitialsColor.pink,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "CB",
        personaName: "Christian Bergqvist2",
        initialsColor: PersonaInitialsColor.purple,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "VL",
        personaName: "Valentina Lovric2",
        initialsColor: PersonaInitialsColor.red,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "MS",
        personaName: "Maor Sharett2",
        initialsColor: PersonaInitialsColor.teal,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "VL",
        personaName: "Another A Name",
        initialsColor: PersonaInitialsColor.blue,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "MS",
        personaName: "Another A Name (So Many A names!)",
        initialsColor: PersonaInitialsColor.darkBlue,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "VL",
        personaName: "Another Anecdotal A Name",
        initialsColor: PersonaInitialsColor.darkGreen,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "MS",
        personaName: "Anerobic A Name",
        initialsColor: PersonaInitialsColor.darkRed,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "VL",
        personaName: "Aerobic A Name",
        initialsColor: PersonaInitialsColor.green,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "MS",
        personaName: "Maor Sharett2",
        initialsColor: PersonaInitialsColor.lightBlue,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "VL",
        personaName: "Valentina Lovric2",
        initialsColor: PersonaInitialsColor.lightGreen,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "MS",
        personaName: "Maor Sharett2",
        initialsColor: PersonaInitialsColor.lightPink,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-female.png",
        imageInitials: "VL",
        personaName: "Valentina Lovric2",
        initialsColor: PersonaInitialsColor.magenta,
    },
    {
        imageUrl: "https://static2.sharepointonline.com/files/fabric/office-ui-fabric-react-assets/persona-male.png",
        imageInitials: "MS",
        personaName: "Maor Sharett2",
        initialsColor: PersonaInitialsColor.orange,
    },
];

const facepileProps: IFacepileProps = {
    personas: facepilePersonas,
    maxDisplayablePersonas: 5,
    overflowButtonType: OverflowButtonType.downArrow,
    overflowButtonProps: {
        ariaLabel: "More users",
        onClick: (ev: React.MouseEvent<HTMLButtonElement>) => alert("overflow icon clicked"),
    },
    ariaDescription: "To move through the items use left and right arrow keys.",
};

export interface IFacepileOverflowExampleState {
    displayedPersonas: any;
    overflowButtonType: OverflowButtonType;
}

export class FacepileOverflowExample extends React.Component<{}, IFacepileOverflowExampleState> {
    constructor(props: {}) {
        super(props);

        this.state = {
            displayedPersonas: 5,
            overflowButtonType: OverflowButtonType.none,
        };
    }

    public render(): JSX.Element {
        const { displayedPersonas, overflowButtonType } = this.state;
        facepileProps.maxDisplayablePersonas = displayedPersonas;
        facepileProps.overflowButtonType = overflowButtonType;

        return (
            <div className={"ms-FacepileExample"}>
                <Facepile {...facepileProps} />
                <div className={"control"}>
                    <Slider
                        label="Number of Personas:"
                        min={1}
                        max={5}
                        step={1}
                        showValue={true}
                        value={this.state.displayedPersonas}
                        onChange={this._onChangePersonaNumber}
                    />
                    <Dropdown
                        label="Overflow Button Type:"
                        selectedKey={this.state.overflowButtonType}
                        options={[
                            { key: OverflowButtonType.none, text: OverflowButtonType[OverflowButtonType.none] },
                            // eslint-disable-next-line max-len
                            { key: OverflowButtonType.descriptive, text: OverflowButtonType[OverflowButtonType.descriptive] },
                            // eslint-disable-next-line max-len
                            { key: OverflowButtonType.downArrow, text: OverflowButtonType[OverflowButtonType.downArrow] },
                            { key: OverflowButtonType.more, text: OverflowButtonType[OverflowButtonType.more] },
                        ]}
                        onChange={this._onChangeType}
                    />
                </div>
            </div>
        );
    }

    private readonly _onChangePersonaNumber = (value: number): void => {
        this.setState(
            (prevState: IFacepileOverflowExampleState): IFacepileOverflowExampleState => {
                prevState.displayedPersonas = value;
                return prevState;
            },
        );
    };

    private readonly _onChangeType = (event: React.FormEvent<HTMLDivElement>, value: IDropdownOption): void => {
        this.setState(
            (prevState: IFacepileOverflowExampleState): IFacepileOverflowExampleState => {
                prevState.overflowButtonType = value.key as OverflowButtonType;
                return prevState;
            },
        );
    };
}
