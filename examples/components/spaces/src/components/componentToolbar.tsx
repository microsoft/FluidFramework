/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLView, IComponent,
} from "@microsoft/fluid-component-core-interfaces";
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import { ISharedDirectory } from "@microsoft/fluid-map";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { SupportedComponent } from "../dataModel";
import { InternalRegistry, IContainerComponentDetails } from "..";

const componentToolbarStyle: React.CSSProperties = { position: "absolute", top: 10, left: 10, zIndex: 1000 };

export const ComponentToolbarName = "componentToolbar";

initializeIcons();

/**
 * A component to allow you to add and manipulate components
 */
export class ComponentToolbar extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly factory = new PrimedComponentFactory(ComponentToolbar, []);

    private supportedComponentList: IContainerComponentDetails[];

    public static getFactory() {
        return ComponentToolbar.factory;
    }

    protected async componentHasInitialized() {
        const registry = await this.context.hostRuntime.IComponentRegistry.get("");
        if (registry) {
            const registryDetails = (registry as IComponent).IComponentRegistryDetails;
            if (registryDetails) {
                this.supportedComponentList = (registryDetails as InternalRegistry).getFromCapabilities("IComponentHTMLView");
            }
        }
    }

    public changeEditState(isEditable: boolean){
        this.root.set("isEditable", isEditable);
    }

    protected async componentInitializingFirstTime() {
        this.root.set("isEditable", false);
    }


    /**
     * Will return a new ComponentToolbarView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <ComponentToolbarView
                emit={this.emit.bind(this)}
                root={this.root}
                supportedComponentList={this.supportedComponentList}
            />,
            div,
        );
    }

}

interface IComponentToolbarViewProps {
    emit: (event: string | symbol, ...args: any[]) => boolean;
    supportedComponentList: IContainerComponentDetails[];
    root: ISharedDirectory;
}

interface IComponentToolbarViewState {
    isEditable: boolean;
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState>{

    private readonly supportedComponentList: IContainerComponentDetails[];

    constructor(props: IComponentToolbarViewProps){
        super(props);
        this.supportedComponentList = props.supportedComponentList;
        this.state = {
            isEditable: props.root.get("isEditable"),
        };
        props.root.on("valueChanged", (change, local) => {
            if (change.key === "isEditable") {
                this.setState({isEditable: props.root.get("isEditable")});
            }
        });
    }

    public emitAddComponentEvent(type: SupportedComponent, w?: number, h?: number) {
        this.props.emit("addComponent", type, w, h);
    }

    public emitToggleEditable() {
        const newIsEditable = !this.state.isEditable;
        this.props.emit("toggleEditable", newIsEditable);
        this.setState({ isEditable: newIsEditable });
    }

    render(){
        const editableButtons: JSX.Element[] = [];
        this.supportedComponentList.forEach(((supportedComponent: IContainerComponentDetails) => {
            editableButtons.push(
                <Button
                    key={`componentToolbarButton-${supportedComponent.type}`}
                    iconProps={{ iconName: supportedComponent.fabricIconName }}
                    onClick={async () =>
                        this.emitAddComponentEvent(supportedComponent.type as SupportedComponent, 4, 4)}
                >
                    {supportedComponent.friendlyName}
                </Button>,
            );
        }));

        return (
            <div style={componentToolbarStyle}>
                <Button
                    id="edit"
                    iconProps={{ iconName: "BullseyeTargetEdit"}}
                    onClick={() => this.emitToggleEditable()}
                >
                    {`Edit: ${this.state.isEditable}`}
                </Button>
                {this.state.isEditable ? editableButtons : undefined}
            </div>
        );
    }
}
