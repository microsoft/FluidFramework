/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import "react-grid-layout/css/styles.css";
import { IComponentSpacesToolbarProps, IInternalRegistryEntry } from "./interfaces";
import { ISpacesStorageModel, SpacesStorageView } from "./spacesStorage";
import { SpacesToolbar } from "./spacesToolbar";

interface ISpacesViewProps {
    supportedComponents: IInternalRegistryEntry[];
    storage: ISpacesStorageModel;
    toolbarProps: IComponentSpacesToolbarProps;
}

export const SpacesView: React.FC<ISpacesViewProps> =
    (props: React.PropsWithChildren<ISpacesViewProps>) => {
        // Editable is a view-only concept; SpacesView is the authority.
        const [editable, setEditable] = React.useState<boolean>(props.storage.componentList.size === 0);

        const combinedToolbarProps = props.toolbarProps;
        combinedToolbarProps.editable = () => editable;

        return (
            <div className="spaces-view">
                <SpacesToolbar
                    props={combinedToolbarProps}
                    editable={editable}
                    setEditable={setEditable}
                    components={props.supportedComponents}
                />
                <SpacesStorageView storage={props.storage} editable={editable} />
            </div>
        );
    };
