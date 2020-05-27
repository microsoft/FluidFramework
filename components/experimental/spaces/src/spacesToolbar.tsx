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
    IInternalRegistryEntry,
    ISpacesProps,
    Templates,
} from ".";
import "./spacesToolbarStyle.css";

initializeIcons();

interface ISpacesToolbarComponentItemProps {
    components: IInternalRegistryEntry[];
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
        const componentButtonList = props.components.map((supportedComponent) => {
            return (
                <Button
                    className="spaces-toolbar-option-button"
                    key={`componentToolbarButton-${supportedComponent.type}`}
                    iconProps={{ iconName: supportedComponent.fabricIconName }}
                    onClick={() => {
                        if (props.addComponent) {
                            props.addComponent(supportedComponent.type);
                        }
                        setOpen(false);
                    }}
                >
                    {supportedComponent.friendlyName}
                </Button>
            );
        });

        return (
            <Collapsible
                open={open}
                trigger={componentsButton}
                className="spaces-toolbar-item"
                openedClassName="spaces-toolbar-item"
            >
                {componentButtonList}
            </Collapsible>
        );
    };

interface ISpacesToolbarTemplateItemProps {
    applyTemplate?(template: Templates): void;
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
        for (const template of Object.keys(Templates)) {
            templateButtonList.push(
                <Button
                    className="spaces-toolbar-option-button"
                    key={`componentToolbarButton-${template}`}
                    onClick={() => {
                        if (props.applyTemplate) {
                            props.applyTemplate(Templates[template]);
                        }
                        setOpen(false);
                    }}
                >
                    {Templates[template]}
                </Button>,
            );
        }

        return (
            <Collapsible
                open={open}
                trigger={templateButton}
                className="spaces-toolbar-item"
                openedClassName="spaces-toolbar-item"
            >
                {templateButtonList}
            </Collapsible>
        );
    };

interface ISpacesToolbarProps {
    spacesProps: ISpacesProps;
    components: IInternalRegistryEntry[];
    editable: boolean;
    setEditable: (editable: boolean) => void;
}

export const SpacesToolbar: React.FC<ISpacesToolbarProps> =
    (props: React.PropsWithChildren<ISpacesToolbarProps>) => {
        const toolbarItems: JSX.Element[] = [];

        // Add the edit button
        toolbarItems.push(
            <div key="edit" className="spaces-toolbar-item">
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
                    components={props.components}
                    addComponent={props.spacesProps.addComponent}
                />,
            );

            if (props.spacesProps.templatesAvailable) {
                toolbarItems.push(
                    <SpacesToolbarTemplateItem
                        key="template"
                        applyTemplate={props.spacesProps.applyTemplate}
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
