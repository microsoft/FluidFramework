/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import Collapsible from "react-collapsible";
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import {
    ISpacesComponentEntry,
} from "./spacesComponentMap";
import "./spacesToolbarStyle.css";

initializeIcons();

interface ISpacesToolbarComponentItemProps {
    componentMap: Map<string, ISpacesComponentEntry>;
    addComponent(type: string): void;
}

const SpacesToolbarComponentItem: React.FC<ISpacesToolbarComponentItemProps> =
    (props: React.PropsWithChildren<ISpacesToolbarComponentItemProps>) => {
        const [open, setOpen] = React.useState<boolean>(false);

        const componentsButton = (
            <Button
                iconProps={{ iconName: open ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                className="spaces-toolbar-top-level-button"
                onClick={() => setOpen(!open)}
            >
                {"Add Components"}
            </Button>
        );
        const componentButtonList = Array.from(
            props.componentMap.entries(),
            ([type, componentEntry]) =>
                <Button
                    className="spaces-toolbar-option-button"
                    key={`componentToolbarButton-${type}`}
                    iconProps={{ iconName: componentEntry.fabricIconName }}
                    onClick={() => {
                        if (props.addComponent) {
                            props.addComponent(type);
                        }
                        setOpen(false);
                    }}
                >
                    {componentEntry.friendlyName}
                </Button>,
        );

        return (
            <Collapsible
                open={open}
                trigger={componentsButton}
                className="spaces-toolbar-tool"
                openedClassName="spaces-toolbar-tool"
            >
                {componentButtonList}
            </Collapsible>
        );
    };

interface ISpacesToolbarTemplateItemProps {
    templates: string[];
    applyTemplate(template: string): void;
}

const SpacesToolbarTemplateItem: React.FC<ISpacesToolbarTemplateItemProps> =
    (props: React.PropsWithChildren<ISpacesToolbarTemplateItemProps>) => {
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
                    key={`componentToolbarButton-${template}`}
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
    componentMap: Map<string, ISpacesComponentEntry>;
    editable: boolean;
    setEditable: (editable: boolean) => void;
    addComponent(type: string): void;
    templates: string[];
    applyTemplate(template: string): void;
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
                <SpacesToolbarComponentItem
                    key="component"
                    componentMap={props.componentMap}
                    addComponent={props.addComponent}
                />,
            );

            if (props.templates.length > 0) {
                toolbarItems.push(
                    <SpacesToolbarTemplateItem
                        key="template"
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
