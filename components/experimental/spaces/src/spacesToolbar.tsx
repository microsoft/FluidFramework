/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import Collapsible from "react-collapsible";
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import {
    IContainerComponentDetails,
    IComponentSpacesToolbarProps,
    Templates,
} from ".";

const componentToolbarStyle: React.CSSProperties = { position: "absolute", top: 10, left: 10, zIndex: 1000 };
const dropDownButtonStyle: React.CSSProperties = { width: "20vh" };
const menuButtonStyle: React.CSSProperties = { width: "20vh", height: "5vh" };
const editableButtonStyle: React.CSSProperties = {
    width: "20vh", height: "5vh", position: "absolute", left: 0, top: 0, margin: "1vh",
};
const templateButtonStyle: React.CSSProperties = {
    width: "20vh", height: "5vh", position: "absolute", left: "40vh", top: 0, margin: "1vh", zIndex: -1,
};
const componentButtonStyle: React.CSSProperties = {
    width: "20vh", height: "5vh", position: "absolute", left: "20vh", top: 0, margin: "1vh", zIndex: -1,
};

initializeIcons();

interface IComponentToolbarViewProps {
    props: IComponentSpacesToolbarProps;
    components: IContainerComponentDetails[];
}

export const SpacesToolbar: React.FC<IComponentToolbarViewProps> =
    (props: React.PropsWithChildren<IComponentToolbarViewProps>) => {
        console.log(props.props.templatesAvailable);
        const templatesAvailable = props.props.templatesAvailable !== undefined
            ? props.props.templatesAvailable()
            : false;
        const editable = props.props.editable !== undefined
            ? props.props.editable()
            : false;

        const [componentListOpen, setComponentListOpen] = React.useState<boolean>(false);
        const [templateListOpen, setTemplateListOpen] = React.useState<boolean>(false);
        // Would prefer not to copy props into state
        const [editableState, setEditableState] = React.useState<boolean>(editable);

        const componentsButton = (
            <Button
                iconProps={{ iconName: componentListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                style={menuButtonStyle}
                onClick={() => setComponentListOpen(!componentListOpen)}
            >
                {"Add Components"}
            </Button>
        );
        const componentButtonList: JSX.Element[] = [];
        if (componentListOpen) {
            props.components.forEach(((supportedComponent: IContainerComponentDetails) => {
                componentButtonList.push(
                    <Button
                        style={dropDownButtonStyle}
                        key={`componentToolbarButton-${supportedComponent.type}`}
                        iconProps={{ iconName: supportedComponent.fabricIconName }}
                        onClick={() => {
                            if (props.props.addComponent) {
                                props.props.addComponent(supportedComponent.type);
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
                    style={menuButtonStyle}
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
                                style={dropDownButtonStyle}
                                key={`componentToolbarButton-${template}`}
                                onClick={() => {
                                    if (props.props.addTemplate) {
                                        props.props.addTemplate(Templates[template]);
                                    }
                                    setTemplateListOpen(false);
                                }}
                            >
                                {Templates[template]}
                            </Button>
                            ,
                        );
                    }
                }
            }
            templateCollapsible = (
                <div style={templateButtonStyle}>
                    <Collapsible
                        open={templateListOpen}
                        trigger={templateButton}
                    >
                        {templateButtonList}
                    </Collapsible>
                </div>
            );
        }
        return (
            <div style={componentToolbarStyle}>
                <Button
                    id="edit"
                    style={editableButtonStyle}
                    iconProps={{ iconName: "BullseyeTargetEdit" }}
                    onClick={() => {
                        const newEditableState = !editableState;
                        setEditableState(newEditableState);
                        if (props.props.setEditable) {
                            props.props.setEditable(newEditableState);
                        }
                    }}
                >
                    {`Edit: ${editableState}`}
                </Button>
                {editableState ?
                    <div>
                        <div style={componentButtonStyle}>
                            <Collapsible
                                open={componentListOpen}
                                trigger={componentsButton}
                            >
                                {componentButtonList}
                            </Collapsible>
                        </div>
                        {templateCollapsible}
                    </div>
                    : undefined}
            </div>
        );
    };
