/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import "react-grid-layout/css/styles.css";
import { ISpacesItemEntry } from "./spacesItemMap";
import { ISpacesStorage, SpacesStorageView } from "./storage";
import { SpacesToolbar } from "./spacesToolbar";
import { ISpacesItem } from "./index";

interface ISpacesViewProps {
    itemMap: Map<string, ISpacesItemEntry>;
    storage: ISpacesStorage<ISpacesItem>;
    addItem(type: string): void;
    getViewForItem: (item: ISpacesItem) => Promise<JSX.Element | undefined>;
    getUrlForItem: (itemId: string) => string;
    templates?: string[];
    applyTemplate?(template: string): void;
}

/**
 * SpacesView is the full view of the Spaces component, including its toolbar and contained items.
 */
export const SpacesView: React.FC<ISpacesViewProps> =
    (props: React.PropsWithChildren<ISpacesViewProps>) => {
        // Editable is a view-only concept; SpacesView is the authority.
        const [editable, setEditable] = React.useState<boolean>(props.storage.itemList.size === 0);

        return (
            <div className="spaces-view">
                <SpacesToolbar
                    editable={editable}
                    setEditable={setEditable}
                    itemMap={props.itemMap}
                    addItem={props.addItem}
                    templates={props.templates}
                    applyTemplate={props.applyTemplate}
                />
                <SpacesStorageView
                    getViewForItem={props.getViewForItem}
                    getUrlForItem={props.getUrlForItem}
                    storage={props.storage}
                    editable={editable}
                />
            </div>
        );
    };
