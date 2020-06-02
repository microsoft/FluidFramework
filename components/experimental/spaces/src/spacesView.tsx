/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import "react-grid-layout/css/styles.css";
import { IInternalRegistryEntry, Templates } from "./interfaces";
import { ISpacesStorage, SpacesStorageView } from "./storage";
import { SpacesToolbar } from "./spacesToolbar";

interface ISpacesViewProps {
    supportedComponents: IInternalRegistryEntry[];
    storage: ISpacesStorage;
    addComponent(type: string): void;
    templatesAvailable: boolean;
    applyTemplate(template: Templates): void;
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
                    components={props.supportedComponents}
                    addComponent={props.addComponent}
                    templatesAvailable={props.templatesAvailable}
                    applyTemplate={props.applyTemplate}
                />
                <SpacesStorageView storage={props.storage} editable={editable} />
            </div>
        );
    };
