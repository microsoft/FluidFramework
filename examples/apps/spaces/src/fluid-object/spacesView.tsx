/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import "react-grid-layout/css/styles.css";
import { spacesItemMap, templateDefinitions } from "./spacesItemMap";
import { SpacesStorageView } from "./storage";
import { Spaces } from "./spaces";
import { SpacesToolbar } from "./spacesToolbar";

interface ISpacesViewProps {
    model: Spaces;
}

export const SpacesView: React.FC<ISpacesViewProps> = (props: ISpacesViewProps) => {
    const { model } = props;
    const [baseUrl, setBaseUrl] = React.useState<string | undefined>("");
    const [editable, setEditable] = React.useState<boolean>(model.storageComponent.itemList.size === 0);
    React.useEffect(() => {
        const getBaseUrl = async () => {
            setBaseUrl(await model.getBaseUrl());
        };

        getBaseUrl().catch((error) => {
            console.error(error);
        });
    });
    return (
        <div className="spaces-view">
            <SpacesToolbar
                editable={editable}
                setEditable={setEditable}
                itemMap={spacesItemMap}
                addItem={model.addItem}
                templates={[...Object.keys(templateDefinitions)]}
                applyTemplate={model.applyTemplate}
            />
            <SpacesStorageView
                getViewForItem={model.getViewForItem}
                getUrlForItem={(itemId: string) => `#${baseUrl}/${itemId}`}
                storage={model.storageComponent}
                editable={editable}
            />
        </div>
    );
};
