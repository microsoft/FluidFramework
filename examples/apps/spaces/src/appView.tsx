/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import {
    Spaces,
    spacesItemMap,
    SpacesView,
    templateDefinitions,
} from "./fluid-object";

interface IAppViewProps {
    model: Spaces;
}

export const AppView: React.FC<IAppViewProps> = (props: IAppViewProps) => {
    const { model } = props;
    const [baseUrl, setBaseUrl] = React.useState<string | undefined>("");
    React.useEffect(() => {
        const getBaseUrl = async () => {
            setBaseUrl(await model.getBaseUrl());
        };

        getBaseUrl().catch((error) => {
            console.error(error);
        });
    });
    return (
        <SpacesView
            itemMap={spacesItemMap}
            storage={model.storageComponent}
            addItem={model.addItem}
            templates={[...Object.keys(templateDefinitions)]}
            applyTemplate={model.applyTemplate}
            getViewForItem={model.getViewForItem}
            getUrlForItem={(itemId: string) => `#${baseUrl}/${itemId}`}
        />
    );
};
