/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";

import React from "react";
import RGL, { WidthProvider, Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
const ReactGridLayout = WidthProvider(RGL);
import { ISpacesStoredItem, ISpacesStorage } from "./spacesStorage";
import "./spacesStorageStyle.css";

interface ISpacesEditButtonProps {
    clickCallback(): void;
    title: string;
}

const SpacesEditButton: React.FC<ISpacesEditButtonProps> =
    (props: React.PropsWithChildren<ISpacesEditButtonProps>) =>
        <button
            className="spaces-edit-button"
            onClick={props.clickCallback}
            onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
            }}
            title={props.title}
        >
            {props.children}
        </button>;

interface ISpacesEditPaneProps {
    url: string;
    removeItem(): void;
}

const SpacesEditPane: React.FC<ISpacesEditPaneProps> =
    (props: React.PropsWithChildren<ISpacesEditPaneProps>) => {
        return (
            <div className="spaces-edit-pane">
                <SpacesEditButton title="Delete" clickCallback={props.removeItem}>❌</SpacesEditButton>
                <SpacesEditButton
                    title="Copy to clipboard"
                    clickCallback={() => {
                        navigator.clipboard.writeText(props.url).then(() => {
                            console.log("Async: Copying to clipboard was successful!");
                        }, (err) => {
                            console.error("Async: Could not copy text: ", err);
                        });
                    }}
                >📎</SpacesEditButton>
                <SpacesEditButton
                    title="Open in new window"
                    clickCallback={() => window.open(props.url, "_blank")}
                >↗️</SpacesEditButton>
            </div>
        );
    };

interface ISpacesItemViewProps {
    url: string;
    editable: boolean;
    getItemView(): Promise<JSX.Element | undefined>;
    removeItem(): void;
}

const SpacesItemView: React.FC<ISpacesItemViewProps> =
    (props: React.PropsWithChildren<ISpacesItemViewProps>) => {
        const [itemView, setItemView] = React.useState<JSX.Element | undefined>(undefined);

        React.useEffect(() => {
            props.getItemView()
                .then(setItemView)
                .catch((error) => console.error(`Error in getting item`, error));
        }, [props.getItemView]);

        return (
            <div className="spaces-item-view">
                {
                    props.editable &&
                    <SpacesEditPane url={props.url} removeItem={props.removeItem} />
                }
                <div className="spaces-embedded-item-wrapper">
                    {itemView}
                </div>
            </div>
        );
    };

// Stronger typing here maybe?
interface ISpacesStorageViewProps<T = any> {
    getViewForItem: (item: Serializable<T>) => Promise<JSX.Element | undefined>;
    getUrlForItem: (itemId: string) => string;
    storage: ISpacesStorage<T>;
    editable: boolean;
}

export const SpacesStorageView: React.FC<ISpacesStorageViewProps> =
    (props: React.PropsWithChildren<ISpacesStorageViewProps>) => {
        // Again stronger typing would be good
        const [itemMap, setItemMap] =
            React.useState<Map<string, ISpacesStoredItem<any>>>(props.storage.itemList);

        React.useEffect(() => {
            const onItemListChanged = (newMap: Map<string, Layout>) => {
                setItemMap(newMap);
            };
            props.storage.on("itemListChanged", onItemListChanged);
            return () => {
                props.storage.off("itemListChanged", onItemListChanged);
            };
        });

        // Render nothing if there are no items
        if (props.storage.itemList.size === 0) {
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
            props.storage.updateLayout(key, newItem);
        };

        const itemViews: JSX.Element[] = [];
        const layouts: Layout[] = [];
        itemMap.forEach((item, itemId) => {
            const getItemView = async () => props.getViewForItem(item.serializableItemData);

            const layout = item.layout;
            // We use separate layout from array because using GridLayout
            // without passing in a new layout doesn't trigger a re-render.
            layout.i = itemId;
            layouts.push(layout);
            itemViews.push(
                <div key={itemId} className="spaces-item-view-wrapper">
                    <SpacesItemView
                        url={props.getUrlForItem(itemId)}
                        editable={props.editable}
                        getItemView={getItemView}
                        removeItem={() => props.storage.removeItem(itemId)}
                    />
                </div>,
            );
        });

        return (
            <ReactGridLayout
                className={`spaces-storage-view${props.editable ? " editable" : ""}`}
                cols={36}
                rowHeight={50}
                width={1800}
                height={10000}
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
                {itemViews}
            </ReactGridLayout>
        );
    };
