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

export const ComponentToolbarName = "componentToolbar";

initializeIcons();

/**
 * A component to allow you to add and manipulate components
 */
export class ComponentToolbar extends PrimedComponent
    implements IComponentHTMLView, IComponentTakesProps<IComponentSpacesToolbarProps> {
    public get IComponentHTMLView() { return this; }
    public get IComponentTakesProps() { return this; }

    private props: IComponentSpacesToolbarProps = {};

    private static readonly factory = new PrimedComponentFactory(
        ComponentToolbarName,
        ComponentToolbar,
        [],
        {});

    private supportedComponentList: IContainerComponentDetails[] = [];

    public static getFactory() {
        return ComponentToolbar.factory;
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

interface IComponentToolbarViewState {
    editable: boolean;
    isComponentListOpen: boolean;
    isTemplateListOpen: boolean;
    templatesAvailable: boolean;
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState> {
    private readonly supportedComponentList: IContainerComponentDetails[];

    constructor(props: IComponentToolbarViewProps) {
        super(props);
        this.supportedComponentList = props.supportedComponentList;
        const editable = props.props.editable ?? false;
        const templatesAvailable = props.props.templatesAvailable ?? false;
        this.state = {
            editable,
            isComponentListOpen: false,
            isTemplateListOpen: false,
            templatesAvailable,
        };
    }

    render() {
        const { isComponentListOpen, isTemplateListOpen, editable: isEditable } = this.state;

        const componentsButton = (
            <Button
                iconProps={{ iconName: isComponentListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                style={menuButtonStyle}
                onClick={() => this.setState({ isComponentListOpen: !isComponentListOpen })}
            >
                {"Add Components"}
            </Button>
        );
        const componentButtonList: JSX.Element[] = [];
        if (isComponentListOpen) {
            this.supportedComponentList.forEach(((supportedComponent: IContainerComponentDetails) => {
                componentButtonList.push(
                    <Button
                        style={dropDownButtonStyle}
                        key={`componentToolbarButton-${supportedComponent.type}`}
                        iconProps={{ iconName: supportedComponent.fabricIconName }}
                        onClick={() => {
                            if (this.props.props.addComponent) {
                                this.props.props.addComponent(supportedComponent.type);
                            }
                            this.setState({ isComponentListOpen: false });
                        }}
                    >
                        {supportedComponent.friendlyName}
                    </Button>
                    ,
                );
            }));
        }
        let templateCollapsible: JSX.Element | undefined;
        if (this.state.templatesAvailable) {
            const templateButtonList: JSX.Element[] = [];
            const templateButton = (
                <Button
                    iconProps={{ iconName: isTemplateListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                    style={menuButtonStyle}
                    onClick={() => this.setState({ isTemplateListOpen: !isTemplateListOpen })}
                >
                    {"Add Templates"}
                </Button>
            );
            if (isTemplateListOpen) {
                // eslint-disable-next-line no-restricted-syntax
                for (const template in Templates) {
                    if (template) {
                        templateButtonList.push(
                            <Button
                                style={dropDownButtonStyle}
                                key={`componentToolbarButton-${template}`}
                                onClick={() => {
                                    if (this.props.props.addTemplate) {
                                        this.props.props.addTemplate(Templates[template]);
                                    }
                                    this.setState({ isTemplateListOpen: false });
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
                        open={isTemplateListOpen}
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
                        const newIsEditable = !this.state.editable;
                        this.setState({ editable: newIsEditable });
                        if (this.props.props.setEditable) {
                            this.props.props.setEditable(newIsEditable);
                        }
                    }}
                >
                    {`Edit: ${isEditable}`}
                </Button>
                {this.state.editable ?
                    <div>
                        <div style={componentButtonStyle}>
                            <Collapsible
                                open={isComponentListOpen}
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
    }
}
