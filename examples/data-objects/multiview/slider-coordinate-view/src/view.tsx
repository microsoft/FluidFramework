/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface ISliderCoordinateViewProps {
    label: string;
    model: ICoordinate;
}

export const SliderCoordinateView: React.FC<ISliderCoordinateViewProps> = (props: ISliderCoordinateViewProps) => {
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
        <div className="slider-view">
            <h3 className="slider-label">{props.label}</h3>
            <div>
                X:
                <input
                    type="range"
                    onChange={(e) => props.model.x = parseInt((e.target as HTMLInputElement).value, 10)}
                    value={x}
                />
                {Math.trunc(x)}
            </div>
            <div>
                Y:
                <input
                    type="range"
                    onChange={(e) => props.model.y = parseInt((e.target as HTMLInputElement).value, 10)}
                    value={y}
                />
                {Math.trunc(y)}
            </div>
        </div>
    );
};
