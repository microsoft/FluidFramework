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
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import {
    IContainerComponentDetails,
    IComponentCallable,
    IComponentCallbacks,
    IComponentToolbar,
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
    implements IComponentHTMLView, IComponentCallable<IComponentCallbacks>, IComponentToolbar {
    public get IComponentHTMLView() { return this; }
    public get IComponentCallable() { return this; }
    public get IComponentToolbar() { return this; }

    private callbacks: IComponentCallbacks = {};

    private static readonly factory = new PrimedComponentFactory(
        ComponentToolbarName,
        ComponentToolbar,
        [],
        {});

    private supportedComponentList: IContainerComponentDetails[] | undefined;

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

    public setEditable(isEditable: boolean) {
        this.root.set("isEditable", isEditable);
    }

    public setTemplatesVisible(isVisible: boolean) {
        this.root.set("isTemplateVisible", isVisible);
    }

    protected async componentInitializingFirstTime() {
        this.root.set("isEditable", true);
        this.root.set("isTemplateVisible", false);
    }

    public setComponentCallbacks(callbacks: IComponentCallbacks) {
        this.callbacks = callbacks;
    }

    /**
     * Will return a new ComponentToolbarView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <ComponentToolbarView
                callbacks={this.callbacks}
                root={this.root}
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                supportedComponentList={this.supportedComponentList!}
            />,
            div,
        );
    }
}

interface IComponentToolbarViewProps {
    callbacks: IComponentCallbacks;
    supportedComponentList: IContainerComponentDetails[];
    root: ISharedDirectory;
}

interface IComponentToolbarViewState {
    isEditable: boolean;
    isComponentListOpen: boolean;
    isTemplateListOpen: boolean;
    isTemplateVisible: boolean;
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState> {
    private readonly supportedComponentList: IContainerComponentDetails[];

    constructor(props: IComponentToolbarViewProps) {
        super(props);
        this.supportedComponentList = props.supportedComponentList;
        this.state = {
            isEditable: props.root.get("isEditable"),
            isComponentListOpen: false,
            isTemplateListOpen: false,
            isTemplateVisible: props.root.get("isTemplateVisible"),
        };
        props.root.on("valueChanged", (change, local) => {
            if (change.key === "isEditable") {
                this.setState({
                    isEditable: props.root.get("isEditable"),
                    isTemplateVisible: props.root.get("isTemplateVisible"),
                });
            }
        });
    }

    public emitAddComponentEvent(type: string, w?: number, h?: number) {
        if (this.props.callbacks.addComponent) {
            this.props.callbacks.addComponent(type, w, h);
        }
    }

    public emitAddTemplateEvent(template: Templates) {
        if (this.props.callbacks.addTemplate) {
            this.props.callbacks.addTemplate(template);
        }
    }

    public emitToggleEditable() {
        const newIsEditable = !this.state.isEditable;
        this.setState({ isEditable: newIsEditable });
        if (this.props.callbacks.toggleEditable) {
            this.props.callbacks.toggleEditable(newIsEditable);
        }
    }

    render() {
        const { isComponentListOpen, isTemplateListOpen, isEditable } = this.state;

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
                        onClick={async () => {
                            this.emitAddComponentEvent(supportedComponent.type, 20, 5);
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
        if (this.state.isTemplateVisible) {
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
                                onClick={async () => {
                                    this.emitAddTemplateEvent(Templates[template]);
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
                    onClick={() => this.emitToggleEditable()}
                >
                    {`Edit: ${isEditable}`}
                </Button>
                {this.state.isEditable ?
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
