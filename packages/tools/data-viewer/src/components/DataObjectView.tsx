/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import React from "react";

import { IFluidLoadable } from "@fluidframework/core-interfaces";

// eslint-disable-next-line import/no-unassigned-import
import "./DataObjectView.css";

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
    const { name } = props;

    // TODO: actually render data about the objects

    return <div className="data-object-view">Object: {name}</div>;
}
