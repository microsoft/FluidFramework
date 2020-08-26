/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { fluidExport as pmfe } from "@fluid-example/prosemirror/dist/prosemirror";
import {
    IButtonStyles,
    IconButton,
    HighContrastSelector,
    initializeIcons,
    IContextualMenuProps,
    IIconProps,
    IContextualMenuItem,
} from "office-ui-fabric-react";

import { ITabsTypes } from "./dataModel";

// setup fabric icons
initializeIcons();

export interface IButtonExampleProps {
    // These are set based on the toggles shown above the examples (not needed in real code)
    disabled?: boolean;
    checked?: boolean;
    createTab: (type: string) => void;
    fluidObjects: ITabsTypes[];
}

const customSplitButtonStyles: IButtonStyles = {
    splitButtonMenuButton: { backgroundColor: "white", width: 15, border: "none" },
    splitButtonMenuIcon: { fontSize: "7px" },
    splitButtonContainer: {
        selectors: {
            [HighContrastSelector]: { border: "none" },
        },
        height: 22,
    },
};

const addIcon: IIconProps = { iconName: "Add" };

export const NewTabButton: React.FC<IButtonExampleProps> =
    (props: IButtonExampleProps) => {
        const { disabled, checked } = props;
        const items: IContextualMenuItem[] = [];
        props.fluidObjects.forEach((fluidObject) => {
            items.push(
                {
                    key: fluidObject.type,
                    text: fluidObject.friendlyName,
                    iconProps: { iconName: fluidObject.fabricIconName },
                    onClick: () => {
                        props.createTab(fluidObject.type);
                    },
                },
            );
        });
        const menuProps: IContextualMenuProps = { items };
        return (
            <IconButton
                split
                iconProps={addIcon}
                splitButtonAriaLabel="new tab options"
                aria-roledescription="split button"
                styles={customSplitButtonStyles}
                menuProps={menuProps}
                ariaLabel="New item"
                onClick={() => props.createTab(pmfe.type)} // this should be taken from the list
                disabled={disabled}
                checked={checked}
                text="hello"
            />
        );
    };
