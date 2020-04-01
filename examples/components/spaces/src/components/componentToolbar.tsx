/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import Collapsible from 'react-collapsible';
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
    InternalRegistry,
    IContainerComponentDetails,
    IComponentCallable,
    IComponentCallbacks,
} from "..";
import { Templates } from "../interfaces";

const componentToolbarStyle: React.CSSProperties = { position: "absolute", top: 10, left: 10, zIndex: 1000 };

export const ComponentToolbarName = "componentToolbar";

initializeIcons();

/**
 * A component to allow you to add and manipulate components
 */
export class ComponentToolbar extends PrimedComponent
    implements IComponentHTMLView, IComponentCallable<IComponentCallbacks> {
    public get IComponentHTMLView() { return this; }
    public get IComponentCallable() { return this; }

    private callbacks: IComponentCallbacks = {};

    private static readonly factory = new PrimedComponentFactory(ComponentToolbar, []);

    private supportedComponentList: IContainerComponentDetails[] | undefined;

    public static getFactory() {
        return ComponentToolbar.factory;
    }

    protected async componentHasInitialized() {
        const registry = await this.context.hostRuntime.IComponentRegistry.get("");
        if (registry) {
            const registryDetails = (registry as IComponent).IComponentRegistryDetails;
            if (registryDetails) {
                this.supportedComponentList = (registryDetails as InternalRegistry)
                    .getFromCapabilities("IComponentHTMLView");
            }
        }
    }

    public changeEditState(isEditable: boolean){
        this.root.set("isEditable", isEditable);
    }

    protected async componentInitializingFirstTime() {
        this.root.set("isEditable", true);
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
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState> {

    private readonly supportedComponentList: IContainerComponentDetails[];

    constructor(props: IComponentToolbarViewProps){
        super(props);
        this.supportedComponentList = props.supportedComponentList;
        this.state = {
            isEditable: props.root.get("isEditable"),
            isComponentListOpen: false,
            isTemplateListOpen: false,
        };
        props.root.on("valueChanged", (change, local) => {
            if (change.key === "isEditable") {
                this.setState({isEditable: props.root.get("isEditable")});
            }
        });
    }

    public emitAddComponentEvent(type: string, w?: number, h?: number) {
        if (this.props.callbacks.addComponent) {
            this.props.callbacks.addComponent(type, w, h);
        }
    }

    public emitToggleEditable() {
        const newIsEditable = !this.state.isEditable;
        this.setState({ isEditable: newIsEditable });
        if (this.props.callbacks.toggleEditable) {
            this.props.callbacks.toggleEditable(newIsEditable);
        }
    }

    render(){
        const { isComponentListOpen, isTemplateListOpen, isEditable } = this.state;

        const componentsButton = (
            <Button
                iconProps={{ iconName: isComponentListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                style={{width: "20vh", height: "5vh"}}
                onClick={() => this.setState({isComponentListOpen: !isComponentListOpen })}
            >
                {"Add Components"}
            </Button>
        );
        const componentButtonList: JSX.Element[] = [];
        if (isComponentListOpen) {
            this.supportedComponentList.forEach(((supportedComponent: IContainerComponentDetails) => {
                componentButtonList.push(
                    <Button
                        style={{width: "20vh"}}
                        key={`componentToolbarButton-${supportedComponent.type}`}
                        iconProps={{ iconName: supportedComponent.fabricIconName }}
                        onClick={async () => {
                            this.emitAddComponentEvent(supportedComponent.type, 20, 5);
                            this.setState({isComponentListOpen: false});
                        }}
                    >
                        {supportedComponent.friendlyName}
                    </Button>
                    ,
                );
            }));
        }

        const templatesButton = (
            <Button
                iconProps={{ iconName: isTemplateListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                style={{width: "20vh", height: "5vh"}}
                onClick={() => this.setState({isTemplateListOpen: !isTemplateListOpen })}
            >
                {"Add Templates"}
            </Button>
        );
        const templateButtonList: JSX.Element[] = [];
        if (isTemplateListOpen) {
            // eslint-disable-next-line no-restricted-syntax
            for (const template in Templates){
                if (template) {
                    templateButtonList.push(
                        <Button
                            style={{width: "20vh"}}
                            key={`componentToolbarButton-${template}`}
                            onClick={async () => {
                                this.emitAddComponentEvent(template, 20, 5);
                                this.setState({isTemplateListOpen: false});
                            }}
                        >
                            {Templates[template]}
                        </Button>
                        ,
                    );
                }
            }
        }

        return (
            <div style={componentToolbarStyle}>
                <Button
                    id="edit"
                    style={{width: "20vh", height: "5vh", position: "absolute", left: 0, top: 0, margin: "1vh"}}
                    iconProps={{ iconName: "BullseyeTargetEdit"}}
                    onClick={() => this.emitToggleEditable()}
                >
                    {`Edit: ${isEditable}`}
                </Button>
                {this.state.isEditable ?
                    <div>
                        <div style={{width: "20vh", height: "5vh", position: "absolute", left: "20vh", top: 0, margin: "1vh", zIndex: -1} as React.CSSProperties}>
                            <Collapsible
                                open={isTemplateListOpen}
                                trigger={templatesButton}
                            >
                                {templateButtonList}
                            </Collapsible>
                        </div>
                        <div style={{width: "20vh", height: "5vh", position: "absolute", left: "40vh", top: 0, margin: "1vh", zIndex: -1} as React.CSSProperties}>
                            <Collapsible
                                open={isComponentListOpen}
                                trigger={componentsButton}
                            >
                                {componentButtonList}
                            </Collapsible>
                        </div>
                    </div>
                    : undefined}
            </div>
        );
    }
}
