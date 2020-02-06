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
import { Manager } from "../container-services";
import { SupportedComponent } from "../dataModel";

const adderStyle: React.CSSProperties = { position: "absolute", top: 10, left: 10, zIndex: 1000 };
/**
 * A component to allow you to add component
 */
export class Adder extends PrimedComponent implements IComponentHTMLVisual {

    public get IComponentHTMLVisual() { return this; }

    protected async componentHasInitialized() {
        // Register with our manager to say that we support adding components, saving the layout, and toggling the edit state
        const manager = await this.getService<Manager>("manager");
        manager.registerProducer("add", this);
        manager.registerProducer("saveLayout", this);
        manager.registerProducer("toggleEditable", this);
    }


    public emitAddComponentEvent(type: SupportedComponent, w?: number, h?: number) {
        this.emit("add", type, w, h);
    }

    public emitSaveLayout() {
        this.emit("saveLayout");
    }

    public emitToggleEditable() {
        this.emit("toggleEditable");
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
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
            <button onClick={() => { this.emitSaveLayout() }}>Save Layout</button>
        </>
        const rerender = () => {
            const editable = this.root.get("isEditable");
            ReactDOM.render(
                <div style={adderStyle}>
                    <button
                        id="edit"
                        onClick={() => this.emitToggleEditable()}
                    >
                        {`Edit: ${editable}`}
                    </button>
                    {editable ? editableButtons : undefined}
                </div>,
            div);
        }
        rerender();
        this.on("toggleEditable", () => {
            rerender();
        })
    }
}

/**
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const AdderInstantiationFactory = new PrimedComponentFactory(
    Adder,
    [],
);
