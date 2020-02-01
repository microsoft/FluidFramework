/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IButtonStyles,
    IconButton,
    HighContrastSelector,
    initializeIcons,
    IContextualMenuProps,
    IIconProps,
    IContextualMenuItem,
} from "office-ui-fabric-react";

// setup fabric icons
initializeIcons();

export interface IButtonExampleProps {
    // These are set based on the toggles shown above the examples (not needed in real code)
    disabled?: boolean;
    checked?: boolean;
    createTab: (type: string) => void;
    components: [string, string, string][];
}

const customSplitButtonStyles: IButtonStyles = {
    splitButtonMenuButton: { backgroundColor: "white", width: 15, border: "none" },
    splitButtonMenuIcon: { fontSize: "7px" },
    // splitButtonDivider: { backgroundColor: "#c8c8c8", width: 1, right: 26, position: "absolute", top: 4, bottom: 4 },
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
                    key: component[0],
                    text: component[1],
                    iconProps: { iconName: component[2] },
                    onClick: () => {
                        props.createTab(component[0]);
                    },
                },
            );
        });
        const menuProps: IContextualMenuProps = {items};
        return (
            <IconButton
                split
                iconProps={addIcon}
                splitButtonAriaLabel="new tab options"
                aria-roledescription="split button"
                styles={customSplitButtonStyles}
                menuProps={menuProps}
                ariaLabel="New item"
                onClick={() => props.createTab("prosemirror")} // default create a prosemirror
                disabled={disabled}
                checked={checked}
            />
        );
    };
