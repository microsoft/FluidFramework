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

interface ISpacesToolbarProps {
    spacesProps: ISpacesProps;
    components: IInternalRegistryEntry[];
    editable: boolean;
    setEditable: (editable: boolean) => void;
}

export const SpacesToolbar: React.FC<ISpacesToolbarProps> =
    (props: React.PropsWithChildren<ISpacesToolbarProps>) => {
        const templatesAvailable = props.spacesProps.templatesAvailable ?? false;

        const [componentListOpen, setComponentListOpen] = React.useState<boolean>(false);
        const [templateListOpen, setTemplateListOpen] = React.useState<boolean>(false);

        const componentsButton = (
            <Button
                iconProps={{ iconName: componentListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                className="spaces-toolbar-top-level-button"
                onClick={() => setComponentListOpen(!componentListOpen)}
            >
                {"Add Components"}
            </Button>
        );
        const componentButtonList: JSX.Element[] = [];
        if (componentListOpen) {
            props.components.forEach(((supportedComponent: IInternalRegistryEntry) => {
                componentButtonList.push(
                    <Button
                        className="spaces-toolbar-option-button"
                        key={`componentToolbarButton-${supportedComponent.type}`}
                        iconProps={{ iconName: supportedComponent.fabricIconName }}
                        onClick={() => {
                            if (props.spacesProps.addComponent) {
                                props.spacesProps.addComponent(supportedComponent.type);
                            }
                            setComponentListOpen(false);
                        }}
                    >
                        {supportedComponent.friendlyName}
                    </Button>,
                );
            }));
        }
        let templateCollapsible: JSX.Element | undefined;
        if (templatesAvailable) {
            const templateButtonList: JSX.Element[] = [];
            const templateButton = (
                <Button
                    iconProps={{ iconName: templateListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                    className="spaces-toolbar-top-level-button"
                    onClick={() => setTemplateListOpen(!templateListOpen)}
                >
                    {"Add Templates"}
                </Button>
            );
            if (templateListOpen) {
                // eslint-disable-next-line no-restricted-syntax
                for (const template in Templates) {
                    if (template) {
                        templateButtonList.push(
                            <Button
                                className="spaces-toolbar-option-button"
                                key={`componentToolbarButton-${template}`}
                                onClick={() => {
                                    if (props.spacesProps.applyTemplate) {
                                        props.spacesProps.applyTemplate(Templates[template]);
                                    }
                                    setTemplateListOpen(false);
                                }}
                            >
                                {Templates[template]}
                            </Button>,
                        );
                    }
                }
            }
            templateCollapsible = (
                <Collapsible
                    open={templateListOpen}
                    trigger={templateButton}
                    className="spaces-toolbar-item"
                    openedClassName="spaces-toolbar-item"
                >
                    {templateButtonList}
                </Collapsible>
            );
        }
        return (
            <div className="spaces-toolbar">
                <div className="spaces-toolbar-item">
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
                </div>
                {props.editable ?
                    <>
                        <Collapsible
                            open={componentListOpen}
                            trigger={componentsButton}
                            className="spaces-toolbar-item"
                            openedClassName="spaces-toolbar-item"
                        >
                            {componentButtonList}
                        </Collapsible>
                        {templateCollapsible}
                    </>
                    : undefined}
            </div>
        );
    };
