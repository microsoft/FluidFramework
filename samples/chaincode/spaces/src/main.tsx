/* eslint-disable import/no-internal-modules */
/* eslint-disable import/no-unassigned-import */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
// import {
//     EmbeddedComponent,
// } from "@microsoft/fluid-aqueduct-react";
import {
    IComponentHTMLVisual,
} from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import GridLayout, { Layout } from "react-grid-layout";

import "../../../../node_modules/react-grid-layout/css/styles.css";
import "../../../../node_modules/react-resizable/css/styles.css";
import { ISpacesDataModel, SpacesDataModel } from "./dataModel";

interface ISpaceGridViewProps {
    dataModel: ISpacesDataModel;
}

interface ISpaceGridViewState {
    editable: boolean;
    componentMap: Map<string, Layout>;
}

class SpacesGridView extends React.Component<ISpaceGridViewProps, ISpaceGridViewState> {
    constructor(props) {
        super(props);
        this.state = {
            editable: this.props.dataModel.componentList.size === 0,
            componentMap: this.props.dataModel.componentList,
        };
    }

    componentDidMount() {
        this.props.dataModel.on("componentListChanged", (newMap: Map<string, Layout>) => {
            this.setState({ componentMap: newMap });
        });
    }

    // This is kinda hacky. Is there a better way?
    // Maybe instead of passing the model we pass a callback to get a model. In that scenario model changes
    // shouldn't trigger a re-render
    shouldComponentUpdate(_nextProps, nextState) {
        if (nextState !== this.state) {
            return true;
        }

        // We don't want to trigger re-render on data model changes since the component already handles them.
        return false;
    }

    onGridChangeEvent(layout: Layout[], oldItem: Layout, newItem: Layout, placeholder: Layout, event: MouseEvent, element: HTMLElement) {
        const id = newItem.i.split("_")[0];
        this.props.dataModel.updateGridItem(id, newItem);
    }

    render() {
        const array = [];
        const layouts: Layout[] = [];
        this.state.componentMap.forEach((layout, id) => {

            // Do some CSS stuff depending on if the user is editing or not
            const editableStyle: React.CSSProperties = { overflow: "hidden", padding: 2 };
            const embeddedComponentStyle: React.CSSProperties = {};
            if (this.state.editable) {
                editableStyle.backgroundColor = "#d3d3d3";
                embeddedComponentStyle.pointerEvents = "none";
                embeddedComponentStyle.opacity = 0.5;
            }

            // using the complex key allows for the components to unmount/mount when changed from another client
            const key = `${id}`; //_${layout.x}${layout.y}${layout.h}${layout.w}`;

            // We use separate layout from array because of how updating works.
            layout.i = key;
            layouts.push(layout);

            const componentUrl = `${window.location.href}/${id}`;

            array.push(
                <div className="text" key={key} style={editableStyle} >
                    {
                        this.state.editable &&
                        <div style={{ opacity: 1, backgroundColor: "none", position: "absolute", bottom: 0, left: 0 }}>
                            <button onClick={() => this.props.dataModel.removeComponent(id)}>Delete</button>
                            <button onClick={() => {
                                navigator.clipboard.writeText(componentUrl).then(() => {
                                    console.log("Async: Copying to clipboard was successful!");
                                }, (err) => {
                                    console.error("Async: Could not copy text: ", err);
                                });
                            }}>📝</button>
                            <button onClick={() => window.open(componentUrl, "_blank")}>↗</button>
                        </div>
                    }
                    <div style={embeddedComponentStyle}>
                        <div>EmbeddedComponent</div>
                    </div>
                </div>);
        });

        return (
            <div>
                <div style={{ position: "fixed", bottom: 10, left: 10, zIndex: 1000 }}>
                    <button onClick={() => { this.setState({ editable: !this.state.editable }); }}>Edit = {this.state.editable.toString()}</button>
                    {this.state.editable &&
                        <React.Fragment>
                            <span>
                                <button onClick={async () => this.props.dataModel.addComponent("clicker")}>Clicker</button>
                                <button onClick={async () => this.props.dataModel.addComponent("button")}>Button</button>
                                <button onClick={async () => this.props.dataModel.addComponent("number")}>Number</button>
                                <button onClick={async () => this.props.dataModel.addComponent("textbox", 2, 2)}>TextBox</button>
                                <button onClick={async () => this.props.dataModel.addComponent("facepile", 1, 2)}>FacePile</button>
                                <button onClick={async () => this.props.dataModel.addComponent("codemirror", 5, 3)}>CodeMirror</button>
                                <button onClick={async () => this.props.dataModel.addComponent("prosemirror", 3, 2)}>ProseMirror</button>
                                <button onClick={async () => this.props.dataModel.addComponent("todo", 1, 3)}>Todo</button>
                                <button onClick={async () => this.props.dataModel.addComponent("birthday", 1, 1)}>Birthday</button>
                            </span>
                            <button onClick={() => { this.props.dataModel.saveLayout(); }}>Save Layout</button>
                        </React.Fragment>
                    }
                </div>
                {
                    this.state.componentMap.size === 0 &&
                    <h1>Add Components Below</h1>
                }
                {
                    this.state.componentMap.size > 0 &&
                    <GridLayout
                        className="layout"
                        cols={9}
                        rowHeight={200}
                        width={1800}
                        compactType={undefined}
                        isDraggable={this.state.editable}
                        isResizable={this.state.editable}
                        preventCollision={true}
                        isRearrangeable={false}
                        onResizeStop={this.onGridChangeEvent.bind(this)}
                        onDragStop={this.onGridChangeEvent.bind(this)}
                        layout={layouts}
                    >
                        {array}
                    </GridLayout>
                }
            </div>
        );
    }
}

/**
 * Clicker example using view interfaces and stock component classes.
 */
export class Spaces extends PrimedComponent implements IComponentHTMLVisual {
    private dataModelInternal: ISpacesDataModel | undefined;

    private get dataModel(): ISpacesDataModel {
        if (!this.dataModelInternal) {
            throw new Error("The Spaces DataModel was not properly initialized.");
        }

        return this.dataModelInternal;
    }

    public get IComponentHTMLVisual() { return this; }

    /**
     * ComponentInitializingFirstTime is where you do setup for your component. This is only called once the first time your component
     * is created. Anything that happens in componentInitializingFirstTime will happen before any other user will see the component.
     */
    protected async componentInitializingFirstTime(props?: any) {
        this.root.createSubDirectory("component-list");
        this.dataModelInternal = new SpacesDataModel(this.root, this.createAndAttachComponent.bind(this), this.getComponent.bind(this));

        // this.dataModelInternal.setTemplate()

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await this.dataModelInternal.setTemplate();
        }

        // this should actually happen on the container.
        await this.createAndAttachComponent("manager", "manager");
    }

    protected async componentInitializingFromExisting() {
        this.dataModelInternal = new SpacesDataModel(this.root, this.createAndAttachComponent.bind(this), this.getComponent.bind(this));
    }

    /**
     * Will return a new Clicker view
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <SpacesGridView dataModel={this.dataModel}></SpacesGridView>,
            div);
    }
}

/**
 * This is where you define all your Distributed Data Structures and Value Types
 */
export const SpacesInstantiationFactory = new PrimedComponentFactory(
    Spaces,
    [],
);


// <EmbeddedComponent component={this.props.dataModel.getComponent(componentId)} />
