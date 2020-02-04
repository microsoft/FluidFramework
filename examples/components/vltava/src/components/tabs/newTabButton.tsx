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
} from "office-ui-fabric-react";

import { TabComponents } from "./dataModel";

// setup fabric icons
initializeIcons();

export interface IButtonExampleProps {
    // These are set based on the toggles shown above the examples (not needed in real code)
    disabled?: boolean;
    checked?: boolean;
    createTab: (type: TabComponents) => void;
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
        const menuProps: IContextualMenuProps = {
            items: [
                {
                    key: "new-spaces",
                    text: "Prosemirror (default)",
                    iconProps: { iconName: "Edit" },
                    onClick: () => {
                        props.createTab("prosemirror");
                    },
                },
                {
                    key: "new-spaces",
                    text: "Spaces",
                    iconProps: { iconName: "SnapToGrid" },
                    onClick: () => {
                        props.createTab("spaces");
                    },
                },
                {
                    key: "new-spaces",
                    text: "CodeMirror",
                    iconProps: { iconName: "Code" },
                    onClick: () => {
                        props.createTab("codemirror");
                    },
                },
                {
                    key: "new-tabs",
                    text: "Tabs",
                    iconProps: { iconName: "BrowserTab" },
                    onClick: () => {
                        props.createTab("tabs");
                    },
                },
                {
                    key: "new-clicker",
                    text: "Clicker",
                    iconProps: { iconName: "NumberField" },
                    onClick: () => {
                        props.createTab("clicker");
                    },
                },
            ],
        };
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
