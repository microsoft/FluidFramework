/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { LoadableObjectRecord } from "@fluidframework/fluid-static";

import { RendererOptions } from "../RendererOptions";
import { Accordion } from "./Accordion";
import { FluidObjectView } from "./data-object-views";

export interface DataObjectsViewProps {
    initialObjects: LoadableObjectRecord;
    sharedObjectRenderers: RendererOptions;
}

export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
    const { initialObjects, sharedObjectRenderers } = props;

    const objects = Object.entries(initialObjects).map(([key, value]) => ({
        name: key,
        loadableObject: value,
    }));

    const children = objects.map((object) => (
        <Accordion header={<b>{object.name}</b>}>
            <FluidObjectView
                fluidObjectHandle={object.loadableObject.handle}
                sharedObjectRenderers={sharedObjectRenderers}
            />
        </Accordion>
    ));

    return (
        <div className="data-objects-view">
            <h3>Data Objects</h3>
            {children}
        </div>
    );
}
