/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Collapsible from "react-collapsible";
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import {
    ISpacesItemEntry,
} from "./spacesItemMap";
import "./spacesToolbarStyle.css";

initializeIcons();

interface ISpacesToolbarAddItemPickerProps {
    itemMap: Map<string, ISpacesItemEntry>;
    addItem(type: string): void;
}

const SpacesToolbarAddItemPicker: React.FC<ISpacesToolbarAddItemPickerProps> =
    (props: React.PropsWithChildren<ISpacesToolbarAddItemPickerProps>) => {
        const [open, setOpen] = React.useState<boolean>(false);

        const itemsButton = (
            <Button
                iconProps={{ iconName: open ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                className="spaces-toolbar-top-level-button"
                onClick={() => setOpen(!open)}
            >
                {"Add Items"}
            </Button>
        );
        const itemButtonList = Array.from(
            props.itemMap.entries(),
            ([type, itemEntry]) =>
                <Button
                    className="spaces-toolbar-option-button"
                    key={`toolbarButton-${type}`}
                    iconProps={{ iconName: itemEntry.fabricIconName }}
                    onClick={() => {
                        props.addItem(type);
                        setOpen(false);
                    }}
                >
                    {itemEntry.friendlyName}
                </Button>,
        );

        return (
            <Collapsible
                open={open}
                trigger={itemsButton}
                className="spaces-toolbar-tool"
                openedClassName="spaces-toolbar-tool"
            >
                {itemButtonList}
            </Collapsible>
        );
    };

interface ISpacesToolbarAddTemplatePickerProps {
    templates: string[];
    applyTemplate(template: string): void;
}

const SpacesToolbarAddTemplatePicker: React.FC<ISpacesToolbarAddTemplatePickerProps> =
    (props: React.PropsWithChildren<ISpacesToolbarAddTemplatePickerProps>) => {
        const [open, setOpen] = React.useState<boolean>(false);
        const templateButton = (
            <Button
                iconProps={{ iconName: open ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                className="spaces-toolbar-top-level-button"
                onClick={() => setOpen(!open)}
            >
                {"Add Templates"}
            </Button>
        );
        const templateButtonList: JSX.Element[] = [];
        for (const template of props.templates) {
            templateButtonList.push(
                <Button
                    className="spaces-toolbar-option-button"
                    key={`toolbarButton-${template}`}
                    onClick={() => {
                        props.applyTemplate(template);
                        setOpen(false);
                    }}
                >
                    {template}
                </Button>,
            );
        }

        return (
            <Collapsible
                open={open}
                trigger={templateButton}
                className="spaces-toolbar-tool"
                openedClassName="spaces-toolbar-tool"
            >
                {templateButtonList}
            </Collapsible>
        );
    };

interface ISpacesToolbarProps {
    itemMap: Map<string, ISpacesItemEntry>;
    editable: boolean;
    setEditable: (editable: boolean) => void;
    addItem(type: string): void;
    templates?: string[];
    applyTemplate?(template: string): void;
}

export const SpacesToolbar: React.FC<ISpacesToolbarProps> =
    (props: React.PropsWithChildren<ISpacesToolbarProps>) => {
        const toolbarItems: JSX.Element[] = [];

        // Add the edit button
        toolbarItems.push(
            <div key="edit" className="spaces-toolbar-tool">
                <Button
                    id="edit"
                    className="spaces-toolbar-top-level-button"
                    iconProps={{ iconName: "BullseyeTargetEdit" }}
                    onClick={() => {
                        const newEditableState = !props.editable;
                        props.setEditable(newEditableState);
                    }}
                >
                    {`Edit: ${props.editable}`}
                </Button>
            </div>,
        );

        if (props.editable) {
            toolbarItems.push(
                <SpacesToolbarAddItemPicker
                    key="items"
                    itemMap={props.itemMap}
                    addItem={props.addItem}
                />,
            );

            if (props.templates !== undefined && props.templates.length > 0 && props.applyTemplate !== undefined) {
                toolbarItems.push(
                    <SpacesToolbarAddTemplatePicker
                        key="templates"
                        templates={props.templates}
                        applyTemplate={props.applyTemplate}
                    />,
                );
            }
        }

        return (
            <div className="spaces-toolbar">
                {toolbarItems}
            </div>
        );
    };
