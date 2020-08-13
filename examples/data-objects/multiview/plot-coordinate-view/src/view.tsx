/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface IPlotCoordinateViewProps {
    model: ICoordinate;
}

/**
 * PlotCoordinateView is a React component that renders the given ICoordinate as a red dot in a rectangle.
 * For now, it only displays the coordinate, but we could enhance it to allow manipulating the coordinate.
 */
export const PlotCoordinateView: React.FC<IPlotCoordinateViewProps> = (props: IPlotCoordinateViewProps) => {
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
        <div className="plot-view">
            <div className="coordinate-dot" style={{ left: x - 2.5, top: y - 2.5 }}></div>
        </div>
    );
};
