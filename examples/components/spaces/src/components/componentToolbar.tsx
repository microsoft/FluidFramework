/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual, IComponent,
} from "@microsoft/fluid-component-core-interfaces";
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { SupportedComponent } from "../dataModel";
import { IContainerComponentDetails, InternalRegistry } from "..";

const componentToolbarStyle: React.CSSProperties = { position: "absolute", top: 10, left: 10, zIndex: 1000 };

export const ComponentToolbarName = "componentToolbar";

initializeIcons();

/**
 * A component to allow you to add and manipulate components
 */
export class ComponentToolbar extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    private static readonly factory = new PrimedComponentFactory(ComponentToolbar, []);

    private supportedComponentList: IContainerComponentDetails[];

    public static getFactory() {
        return ComponentToolbar.factory;
    }

    protected async componentHasInitialized() {
        const registry = await (this.context.hostRuntime.IComponentRegistry as InternalRegistry).get("");
        const registryDetails = (registry as IComponent).IComponentRegistryDetails;
        this.supportedComponentList = (registryDetails as InternalRegistry).getFromCapabilities("IComponentHTMLVisual");
    }

    /**
     * Will return a new ComponentToolbarView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <ComponentToolbarView emit={this.emit.bind(this)} supportedComponentList={this.supportedComponentList}/>,
            div,
        );
    }
}

interface IComponentToolbarViewProps {
    emit: (event: string | symbol, ...args: any[]) => boolean;
    supportedComponentList: IContainerComponentDetails[];
}

interface IComponentToolbarViewState {
    isEditable: boolean;
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState>{

    private readonly emit: (event: string | symbol, ...args: any[]) => boolean;
    private readonly supportedComponentList: IContainerComponentDetails[];

    constructor(props: IComponentToolbarViewProps){
        super(props);
        this.emit = props.emit;
        this.supportedComponentList = props.supportedComponentList;
        this.state = {
            isEditable: true,
        };
    }

    public emitAddComponentEvent(type: SupportedComponent, w?: number, h?: number) {
        this.emit("addComponent", type, w, h);
    }

    public emitSaveLayout() {
        this.emit("saveLayout");
    }

    public emitToggleEditable() {
        const newIsEditable = !this.state.isEditable;
        this.emit("toggleEditable", newIsEditable);
        this.setState({isEditable: newIsEditable});
    }

    render(){
        const editableButtons: JSX.Element[] = [];
        this.supportedComponentList.forEach(((supportedComponent: IContainerComponentDetails) => {
            editableButtons.push(
                <Button
                    key={`componentToolbarButton-${supportedComponent.type}`}
                    iconProps={{ iconName: supportedComponent.fabricIconName }}
                    onClick={async () =>
                        this.emitAddComponentEvent(supportedComponent.type, 4, 4)}
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
                <Button
                    iconProps={{ iconName: "Save" }}
                    onClick={() => this.emitSaveLayout()}
                >
                    {"Save Layout"}
                </Button>
            </div>
        );
    }
}
