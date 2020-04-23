/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
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
    InternalRegistry,
} from "..";

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

    public changeEditState(isEditable: boolean) {
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
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState> {
    private readonly supportedComponentList: IContainerComponentDetails[];

    constructor(props: IComponentToolbarViewProps) {
        super(props);
        this.supportedComponentList = props.supportedComponentList;
        this.state = {
            isEditable: props.root.get("isEditable"),
        };
        props.root.on("valueChanged", (change, local) => {
            if (change.key === "isEditable") {
                this.setState({ isEditable: props.root.get("isEditable") });
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

    render() {
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
                    iconProps={{ iconName: "BullseyeTargetEdit" }}
                    onClick={() => this.emitToggleEditable()}
                >
                    {`Edit: ${this.state.isEditable}`}
                </Button>
                {this.state.isEditable ? editableButtons : undefined}
            </div>
        );
    }
}
