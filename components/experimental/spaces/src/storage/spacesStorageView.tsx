/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";
import RGL, { WidthProvider, Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
const ReactGridLayout = WidthProvider(RGL);

import { PrimedContext } from "../context";
import "./spacesStorageStyle.css";

interface ISpacesEditButtonProps {
    clickCallback(): void;
}

const SpacesEditButton: React.FC<ISpacesEditButtonProps> =
    (props: React.PropsWithChildren<ISpacesEditButtonProps>) =>
        <button
            className="spaces-edit-button"
            onClick={props.clickCallback}
            onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
            }}
        >
            {props.children}
        </button>;

interface ISpacesEditPaneProps {
    url: string;
    removeComponent(): void;
}

const SpacesEditPane: React.FC<ISpacesEditPaneProps> =
    (props: ISpacesEditPaneProps) => {
        const componentUrl = `${window.location.href}/${props.url}`;
        return (
            <div className="spaces-edit-pane">
                <SpacesEditButton clickCallback={props.removeComponent}>❌</SpacesEditButton>
                <SpacesEditButton
                    clickCallback={() => {
                        navigator.clipboard.writeText(componentUrl).then(() => {
                            console.log("Async: Copying to clipboard was successful!");
                        }, (err) => {
                            console.error("Async: Could not copy text: ", err);
                        });
                    }}
                >📎</SpacesEditButton>
                <SpacesEditButton clickCallback={() => window.open(componentUrl, "_blank")}>↗️</SpacesEditButton>
            </div>
        );
    };

interface ISpacesComponentViewProps {
    url: string;
    editable: boolean;
    component: IComponent;
    removeComponent(): void;
}

const SpacesComponentView: React.FC<ISpacesComponentViewProps> =
    (props: ISpacesComponentViewProps) => {
        const { component } = props;
        return (
            <div className="spaces-component-view">
                {
                    props.editable &&
                    <SpacesEditPane url={props.url} removeComponent={props.removeComponent} />
                }
                <div className="spaces-embedded-component-wrapper">
                    {
                        component &&
                        <ReactViewAdapter component={ component } />
                    }
                </div>
            </div>
        );
    };

interface ISpacesStorageViewProps {
    editable: boolean;
}

export const SpacesStorageView: React.FC<ISpacesStorageViewProps> =
    (props: ISpacesStorageViewProps) => {
        const {
            reducer,
            selector,
            state,
        } = React.useContext(PrimedContext);
        if (reducer === undefined || state === undefined || selector === undefined) {
            return <div>{"Context is not providing data correctly"}</div>;
        }
        const componentMap = selector?.componentMap.function(state).result;
        // Render nothing if there are no components
        if (componentMap === undefined || componentMap.size === 0) {
            return <></>;
        }

        const onGridChangeEvent = (
            layout: Layout[],
            oldItem: Layout,
            newItem: Layout,
            placeholder: Layout,
            event: MouseEvent,
            element: HTMLElement,
        ) => {
            const key = newItem.i.split("_")[0];
            reducer.updateLayout.function(state, key, newItem);
        };

        const components: JSX.Element[] = [];
        const layouts: Layout[] = [];
        componentMap.forEach((model, url) => {
            const layout = model.layout;
            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            layout.i = url;
            layouts.push(layout);
            components.push(
                <div key={url} className="spaces-component-view-wrapper">
                    <SpacesComponentView
                        url={url}
                        editable={props.editable}
                        component={model.component}
                        removeComponent={() => reducer.removeComponent.function(state, url)}
                    />
                </div>,
            );
        });

        return (
            <ReactGridLayout
                className={`spaces-storage-view${ props.editable ? " editable" : "" }`}
                cols={36}
                rowHeight={50}
                width={1800}
                height={10000}
                // eslint-disable-next-line no-null/no-null
                compactType={null} // null is required for the GridLayout
                isDroppable={props.editable}
                isDraggable={props.editable}
                isResizable={props.editable}
                preventCollision={true}
                isRearrangeable={false}
                onResizeStop={onGridChangeEvent}
                onDragStop={onGridChangeEvent}
                layout={layouts}
            >
                {components}
            </ReactGridLayout>
        );
    };
