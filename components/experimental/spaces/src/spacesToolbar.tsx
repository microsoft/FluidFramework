/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import Collapsible from "react-collapsible";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import {
    IContainerComponentDetails,
    IComponentTakesProps,
    IComponentSpacesToolbarProps,
    InternalRegistry,
    Templates,
} from "..";

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

export const SpacesToolbarName = "spacesToolbar";

initializeIcons();

/**
 * A component to allow you to add and manipulate components
 */
export class SpacesToolbar extends PrimedComponent
    implements IComponentHTMLView, IComponentTakesProps<IComponentSpacesToolbarProps> {
    public get IComponentHTMLView() { return this; }
    public get IComponentTakesProps() { return this; }

    private props: IComponentSpacesToolbarProps = {};

    private static readonly factory = new PrimedComponentFactory(
        SpacesToolbarName,
        SpacesToolbar,
        [],
        {});

    private supportedComponentList: IContainerComponentDetails[] = [];

    public static getFactory() {
        return SpacesToolbar.factory;
    }

    protected async componentHasInitialized() {
        const registry = await this.context.containerRuntime.IComponentRegistry.get("");
        if (registry) {
            const registryDetails = (registry as IComponent).IComponentRegistryDetails;
            if (registryDetails) {
                this.supportedComponentList = (registryDetails as InternalRegistry)
                    .getFromCapability("IComponentHTMLView");
            }
        }
    }

    public setComponentProps(props: IComponentSpacesToolbarProps) {
        this.props = props;
    }

    /**
     * Will return a new ComponentToolbarView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <ComponentToolbarView
                props={this.props}
                supportedComponentList={this.supportedComponentList}
            />,
            div,
        );
    }
}

interface IComponentToolbarViewProps {
    props: IComponentSpacesToolbarProps;
    supportedComponentList: IContainerComponentDetails[];
}

const ComponentToolbarView: React.FC<IComponentToolbarViewProps> =
    (props: React.PropsWithChildren<IComponentToolbarViewProps>) => {
        const templatesAvailable = props.props.templatesAvailable ?? false;
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
            props.supportedComponentList.forEach(((supportedComponent: IContainerComponentDetails) => {
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
