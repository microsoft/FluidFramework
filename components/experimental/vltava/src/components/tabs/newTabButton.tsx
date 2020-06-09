/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
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
    components: ITabsTypes[];
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

export const NewTabButton: React.FunctionComponent<IButtonExampleProps> =
    (props: IButtonExampleProps) => {
        const { disabled, checked } = props;
        const items: IContextualMenuItem[] = [];
        props.components.forEach((component) => {
            items.push(
                {
                    key: component.type,
                    text: component.friendlyName,
                    iconProps: { iconName: component.fabricIconName },
                    onClick: () => {
                        props.createTab(component.type);
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
                onClick={() => props.createTab("prosemirror")} // this should be taken from the list
                disabled={disabled}
                checked={checked}
                text="hello"
            />
        );
    };
