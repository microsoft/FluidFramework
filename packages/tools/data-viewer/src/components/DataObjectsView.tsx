/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Stack } from "office-ui-fabric-react";
import React from "react";

import { LoadableObjectRecord } from "fluid-framework";

import { IFluidLoadable } from "@fluidframework/core-interfaces";

import { Accordion } from "./Accordion";

export interface DataObjectsViewProps {
    initialObjects: LoadableObjectRecord;
}

export function DataObjectsView(props: DataObjectsViewProps): React.ReactElement {
    const { initialObjects } = props;

    const objects: DataObjectViewProps[] = Object.entries(initialObjects).map(([key, value]) => ({
        name: key,
        dataObject: value,
    }));

    const children = objects.map((object) => (
        <Accordion header={<b>{object.name}</b>}>
            <DataObjectView {...object} />
        </Accordion>
    ));

    return (
        <div className="data-objects-view">
            <h3>Data Objects</h3>
            {children}
        </div>
    );
}

/**
 * {@link DataObjectView} input props.
 */
export interface DataObjectViewProps {
    name: string;
    dataObject: IFluidLoadable; // TODO: a different type?
}

/**
 * Displays information about the provided container.
 *
 * @param props - See {@link ContainerDataViewProps}.
 */
export function DataObjectView(props: DataObjectViewProps): React.ReactElement {
    // TODO: actually render data about the objects

    return <Stack className="data-object-view">TODO</Stack>;
}
