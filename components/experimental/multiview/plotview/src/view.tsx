/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

interface IPlotCoordinateViewProps {
    model: ICoordinate;
}

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
        <div style={{ width: 100, height: 100, position: "relative", border: "1px solid black" }}>
            <div style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                position: "absolute",
                left: x - 2.5,
                top: y - 2.5,
                backgroundColor: "#f00",
            }}></div>
        </div>
    );
};
