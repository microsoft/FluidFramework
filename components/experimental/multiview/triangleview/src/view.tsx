/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface IPlotPointViewProps {
    model: ICoordinate;
}

export const PlotPointView: React.FC<IPlotPointViewProps> = (props: IPlotPointViewProps) => {
    const [x, setX] = React.useState(props.model.x);
    const [y, setY] = React.useState(props.model.y);

    React.useEffect(() => {
        const onCoordinateChanged = () => {
            setX(props.model.x);
            setY(props.model.y);
        };
        props.model.on("coordinateChanged", onCoordinateChanged);
        return () => {
            props.model.off("coordinateChanged", onCoordinateChanged);
        };
    }, [props.model]);

    return (
        <div className="coordinate-dot" style={{ left: x - 2.5, top: y - 2.5 }}></div>
    );
};

interface ITriangleViewProps {
    coordinate1: ICoordinate;
    coordinate2: ICoordinate;
    coordinate3: ICoordinate;
}

export const TriangleView: React.FC<ITriangleViewProps> = (props: ITriangleViewProps) => {
    return (
        <div className="plot-view">
            <PlotPointView model={ props.coordinate1 } />
            <PlotPointView model={ props.coordinate2 } />
            <PlotPointView model={ props.coordinate3 } />
        </div>
    );
}
