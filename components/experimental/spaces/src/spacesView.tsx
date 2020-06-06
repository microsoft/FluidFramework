/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import "react-grid-layout/css/styles.css";
import { ISpacesComponentEntry } from "./spacesComponentMap";
import { ISpacesStorage, SpacesStorageView } from "./storage";
import { SpacesToolbar } from "./spacesToolbar";

interface ISpacesViewProps {
    componentMap: Map<string, ISpacesComponentEntry>;
    storage: ISpacesStorage;
    addComponent(type: string): void;
    templates?: string[];
    applyTemplate?(template: string): void;
}

/**
 * SpacesView is the full view of the Spaces component, including its toolbar and contained components.
 */
export const SpacesView: React.FC<ISpacesViewProps> =
    (props: React.PropsWithChildren<ISpacesViewProps>) => {
        // Editable is a view-only concept; SpacesView is the authority.
        const [editable, setEditable] = React.useState<boolean>(props.storage.componentList.size === 0);

        return (
            <div className="spaces-view">
                <SpacesToolbar
                    editable={editable}
                    setEditable={setEditable}
                    componentMap={props.componentMap}
                    addComponent={props.addComponent}
                    templates={props.templates}
                    applyTemplate={props.applyTemplate}
                />
                <SpacesStorageView storage={props.storage} editable={editable} />
            </div>
        );
    };
