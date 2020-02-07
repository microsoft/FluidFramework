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

const componentToolbarStyle: React.CSSProperties = { position: "absolute", top: 10, left: 10, zIndex: 1000 };

export const ComponentToolbarName = "componentToolbar";

/**
 * A component to allow you to add component
 */
export class ComponentToolbar extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }

    private static readonly factory = new PrimedComponentFactory(ComponentToolbar, []);

    public static getFactory() {
        return ComponentToolbar.factory;
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        this.emit
        ReactDOM.render(
            <ComponentToolbarView emit={this.emit.bind(this)}/>,
            div,
        );
    }
}

interface IComponentToolbarViewProps {
    emit: any;
}

interface IComponentToolbarViewState {
    isEditable: boolean;
}

class ComponentToolbarView extends React.Component<IComponentToolbarViewProps, IComponentToolbarViewState>{
    private emit: any;
    constructor(props: IComponentToolbarViewProps){
        super(props);
        this.emit = props.emit;
        this.state = {
            isEditable: true
        };
    }

    public emitAddComponentEvent(type: SupportedComponent, w?: number, h?: number) {
        this.emit("add", type, w, h);
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
        const editableButtons =
            <>
                <button onClick={async () => this.emitAddComponentEvent("clicker", 2, 2)}>
                    Clicker
                </button>
                <button onClick={async () => this.emitAddComponentEvent("button", 2, 2)}>
                    Button
                </button>
                <button onClick={async () => this.emitAddComponentEvent("number", 2, 2)}>
                    Number
                </button>
                <button onClick={async () => this.emitAddComponentEvent("textbox", 9, 6)}>
                    TextBox
                </button>
                <button onClick={async () => this.emitAddComponentEvent("facepile", 2, 4)}>
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