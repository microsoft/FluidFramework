/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { ICoordinate } from "@fluid-example/multiview-coordinate-interface";

interface ICoordinateViewProps {
    model: ICoordinate;
}

export const CoordinateView: React.FC<ICoordinateViewProps> = (props: ICoordinateViewProps) => {
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
        <div>
            X: <input
                type="range"
                onInput={(e) => props.model.x = parseInt((e.target as HTMLInputElement).value) }
                value={x}
            />
            Y: <input
                type="range"
                onInput={(e) => props.model.y = parseInt((e.target as HTMLInputElement).value) }
                value={y}
            />
        </div>
    );
};
