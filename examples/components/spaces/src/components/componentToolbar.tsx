/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { SupportedComponent } from "../dataModel";
import { ButtonName, FacePileName, NumberName, TextBoxName } from ".";

const componentToolbarStyle: React.CSSProperties = { position: "absolute", top: 10, left: 10, zIndex: 1000 };

export const ComponentToolbarName = "componentToolbar";

/**
 * A component to allow you to add and manipulate components
 */
export class ComponentToolbar extends PrimedComponent implements IComponentHTMLVisual {

    private hasComponents = false;

    public get IComponentHTMLVisual() { return this; }

    private static readonly factory = new PrimedComponentFactory(ComponentToolbar, []);

    public static getFactory() {
        return ComponentToolbar.factory;
    }

    protected async componentInitializingFirstTime() {
        this.addListener("initializeComponents", (hasComponents: boolean) => {
            this.hasComponents = hasComponents;
        });
    }

    protected async componentInitializingFromExisting() {
        this.addListener("initializeComponents", (hasComponents: boolean) => {
            this.hasComponents = hasComponents;
        });
    }


    /**
     * Will return a new ComponentToolbarView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <ComponentToolbarView emit={this.emit.bind(this)} hasComponents={this.hasComponents} />,
            div,
        );
    }

}

interface IComponentToolbarViewProps {
    emit: (event: string | symbol, ...args: any[]) => boolean;
    hasComponents: boolean;
}

interface IComponentToolbarViewState {
    isEditable: boolean;
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState>{

    constructor(props: IComponentToolbarViewProps){
        super(props);
        this.state = {
            isEditable: !props.hasComponents,
        };
    }

    public emitAddComponentEvent(type: SupportedComponent, w?: number, h?: number) {
        this.props.emit("addComponent", type, w, h);
    }

    public emitSaveLayout() {
        this.props.emit("saveLayout");
    }

    public emitToggleEditable() {
        const newIsEditable = !this.state.isEditable;
        this.props.emit("toggleEditable", newIsEditable);
        this.setState({ isEditable: newIsEditable });
    }

    render(){
        const editableButtons =
            <>
                <button onClick={async () => this.emitAddComponentEvent("clicker", 2, 2)}>
                    Clicker
                </button>
                <button onClick={async () => this.emitAddComponentEvent(ButtonName, 2, 2)}>
                    Button
                </button>
                <button onClick={async () => this.emitAddComponentEvent(NumberName, 2, 2)}>
                    Number
                </button>
                <button onClick={async () => this.emitAddComponentEvent(TextBoxName, 9, 6)}>
                    TextBox
                </button>
                <button onClick={async () => this.emitAddComponentEvent(FacePileName, 2, 4)}>
                    FacePile
                </button>
                <button onClick={async () => this.emitAddComponentEvent("codemirror", 12, 8)}>
                    CodeMirror
                </button>
                <button onClick={async () => this.emitAddComponentEvent("prosemirror", 16, 12)}>
                    ProseMirror
                </button>
                <button onClick={() => this.emitSaveLayout()}>Save Layout</button>
            </>;
        return (
            <div style={componentToolbarStyle}>
                <button
                    id="edit"
                    onClick={() => this.emitToggleEditable()}
                >
                    {`Edit: ${this.state.isEditable}`}
                </button>
                {this.state.isEditable ? editableButtons : undefined}
            </div>
        );
    }
}
