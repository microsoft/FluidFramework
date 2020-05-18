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
    IInternalRegistryEntry,
    Templates,
} from "./interfaces";
import { PrimedContext } from "./context";

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

interface ISpacesToolbarProps {
    editable: boolean;
    setEditable: (editable: boolean) => void;
}

export const SpacesToolbar: React.FC<ISpacesToolbarProps> =
    (props: React.PropsWithChildren<ISpacesToolbarProps>) => {
        const {
            dispatch,
            fetch,
            supportedComponents,
        } = React.useContext(PrimedContext);
        if (dispatch === undefined || fetch === undefined || supportedComponents === undefined) {
            return <div>{"Context is not providing data correctly"}</div>;
        }
        const templatesAvailable = fetch("areTemplatesAvailable") ?? false;

        const [componentListOpen, setComponentListOpen] = React.useState<boolean>(false);
        const [templateListOpen, setTemplateListOpen] = React.useState<boolean>(false);

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
            supportedComponents.forEach(((supportedComponent: IInternalRegistryEntry) => {
                componentButtonList.push(
                    <Button
                        style={dropDownButtonStyle}
                        key={`componentToolbarButton-${supportedComponent.type}`}
                        iconProps={{ iconName: supportedComponent.fabricIconName }}
                        onClick={() => {
                            dispatch("addComponent", supportedComponent.type);
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
                                    dispatch("applyTemplate", Templates[template]);
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
                        const newEditableState = !props.editable;
                        props.setEditable(newEditableState);
                    }}
                >
                    {`Edit: ${props.editable}`}
                </Button>
                {props.editable ?
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
