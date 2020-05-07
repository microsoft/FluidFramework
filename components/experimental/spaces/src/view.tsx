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
import { ISpacesDataModel } from "./dataModel";
import { SpacesCompatibleToolbar, IComponentSpacesToolbarProps } from "./interfaces";
import "./style.css";

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
    (props: React.PropsWithChildren<ISpacesEditPaneProps>) => {
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
    getComponent(): Promise<IComponent | undefined>;
    removeComponent(): void;
}

const SpacesComponentView: React.FC<ISpacesComponentViewProps> =
    (props: React.PropsWithChildren<ISpacesComponentViewProps>) => {
        const [component, setComponent] = React.useState<IComponent | undefined>(undefined);

        React.useEffect(() => {
            props.getComponent()
                .then(setComponent)
                .catch((error) => console.error(`Error in getting component`, error));
        });

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

interface ISpacesGridViewProps {
    toolbarComponentP: Promise<SpacesCompatibleToolbar | undefined>;
    dataModel: ISpacesDataModel;
    toolbarProps: IComponentSpacesToolbarProps;
}

export const SpacesView: React.FC<ISpacesGridViewProps> =
    (props: React.PropsWithChildren<ISpacesGridViewProps>) => {
        const [toolbarComponent, setToolbarComponent] = React.useState<SpacesCompatibleToolbar | undefined>(undefined);
        const [editable, setEditable] = React.useState<boolean>(props.dataModel.componentList.size === 0);
        const [componentMap, setComponentMap] = React.useState<Map<string, Layout>>(props.dataModel.componentList);

        // Editable is a view-only concept; SpacesView is the authority.
        const combinedToolbarProps = props.toolbarProps;
        combinedToolbarProps.editable = () => editable;
        combinedToolbarProps.setEditable = (isEditable?: boolean) => setEditable(isEditable ?? !editable);

        React.useEffect(() => {
            // Need an event for when the component toolbar changes
            props.toolbarComponentP
                .then((retrievedToolbar) => {
                    retrievedToolbar?.setComponentProps(combinedToolbarProps);
                    setToolbarComponent(retrievedToolbar);
                })
                .catch((error) => {
                    console.error(`Error getting toolbar component`, error);
                });
        });

        React.useEffect(() => {
            const onComponentListChanged = (newMap: Map<string, Layout>) => {
                setComponentMap(newMap);
            };
            props.dataModel.on("componentListChanged", onComponentListChanged);
            return () => {
                props.dataModel.off("componentListChanged", onComponentListChanged);
            };
        });

        const onGridChangeEvent = (
            layout: Layout[],
            oldItem: Layout,
            newItem: Layout,
            placeholder: Layout,
            event: MouseEvent,
            element: HTMLElement,
        ) => {
            const id = newItem.i.split("_")[0];
            props.dataModel.updateGridItem(id, newItem);
        };

        const toolbarElement = toolbarComponent !== undefined
            ? <ReactViewAdapter component={ toolbarComponent } />
            : undefined;

        const components: JSX.Element[] = [];
        const layouts: Layout[] = [];
        componentMap.forEach((layout, url) => {
            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            layout.i = url;
            layouts.push(layout);
            components.push(
                <div key={url} className="spaces-component-view-wrapper">
                    <SpacesComponentView
                        url={url}
                        editable={editable}
                        getComponent={async () => props.dataModel.getComponent(url)}
                        removeComponent={() => props.dataModel.removeItem(url)}
                    />
                </div>,
            );
        });

        return (
            <div className={`spaces-grid-view${ editable ? " editable" : "" }`}>
                { toolbarElement }
                {
                    componentMap.size > 0 &&
                        <ReactGridLayout
                            className="spaces-component-grid"
                            cols={36}
                            rowHeight={50}
                            width={1800}
                            height={10000}
                            // eslint-disable-next-line no-null/no-null
                            compactType={null} // null is required for the GridLayout
                            isDroppable={editable}
                            isDraggable={editable}
                            isResizable={editable}
                            preventCollision={true}
                            isRearrangeable={false}
                            onResizeStop={onGridChangeEvent}
                            onDragStop={onGridChangeEvent}
                            layout={layouts}
                        >
                            {components}
                        </ReactGridLayout>
                }
            </div>
        );
    };
