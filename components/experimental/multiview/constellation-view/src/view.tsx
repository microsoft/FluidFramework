/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { IConstellation, ICoordinate } from "@fluid-example/multiview-coordinate-interface";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface IStarViewProps {
    model: ICoordinate;
}

/**
 * StarView is a React component that renders a single coordinate as a dot (representing a star).
 */
const StarView: React.FC<IStarViewProps> = (props: IStarViewProps) => {
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
        <div className="star" style={{ left: x - 2.5, top: y - 2.5 }}></div>
    );
};

interface IConstellationViewProps {
    model: IConstellation;
}

/**
 * ConstellationView is a React component that renders the given IConstellation's stars as dots.
 */
export const ConstellationView: React.FC<IConstellationViewProps> = (props: IConstellationViewProps) => {
    const [starList, setStarList] = React.useState<ICoordinate[]>(props.model.stars);
    React.useEffect(() => {
        const onConstellationChanged = () => {
            setStarList(props.model.stars);
        };
        props.model.on("constellationChanged", onConstellationChanged);
        return () => {
            props.model.off("constellationChanged", onConstellationChanged);
        };
    }, [props.model]);

    const starElements: JSX.Element[] = [];
    for (const [index, star] of starList.entries()) {
        starElements.push(
            <StarView model={star} key={index} />,
        );
    }

    return (
        <div className="constellation-view">
            { starElements }
        </div>
    );
};
