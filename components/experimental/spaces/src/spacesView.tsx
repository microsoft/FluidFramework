/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import "react-grid-layout/css/styles.css";
import { IComponentSpacesToolbarProps, IContainerComponentDetails } from "./interfaces";
import { ISpacesStorageModel } from "./spacesStorage";
import { SpacesToolbar } from "./spacesToolbar";
import { SpacesStorageView } from "./spacesStorageView";

interface ISpacesViewProps {
    supportedToolbarComponents: IContainerComponentDetails[];
    dataModel: ISpacesStorageModel;
    toolbarProps: IComponentSpacesToolbarProps;
}

export const SpacesView: React.FC<ISpacesViewProps> =
    (props: React.PropsWithChildren<ISpacesViewProps>) => {
        // Editable is a view-only concept; SpacesView is the authority.
        const [editable, setEditable] = React.useState<boolean>(props.dataModel.componentList.size === 0);

        const combinedToolbarProps = props.toolbarProps;
        combinedToolbarProps.editable = () => editable;
        combinedToolbarProps.setEditable = (isEditable?: boolean) => setEditable(isEditable ?? !editable);

        return (
            <div className="spaces-view">
                <SpacesToolbar props={combinedToolbarProps} components={props.supportedToolbarComponents} />
                <SpacesStorageView storage={props.dataModel} editable={editable} />
            </div>
        );
    };
