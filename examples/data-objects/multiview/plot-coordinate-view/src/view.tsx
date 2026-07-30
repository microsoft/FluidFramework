/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { type FC, useEffect, useState } from "react";
// eslint-disable-next-line import-x/no-unassigned-import
import "./style.css";

interface IPlotCoordinateViewProps {
	model: ICoordinate;
}

/**
 * PlotCoordinateView is a React component that renders the given ICoordinate as a red dot in a rectangle.
 * For now, it only displays the coordinate, but we could enhance it to allow manipulating the coordinate.
 * @internal
 */
export const PlotCoordinateView: FC<IPlotCoordinateViewProps> = (
	props: IPlotCoordinateViewProps,
) => {
	const [x, setX] = useState(props.model.x);
	const [y, setY] = useState(props.model.y);

	useEffect((): (() => void) => {
		const onCoordinateChanged = (): void => {
			setX(props.model.x);
			setY(props.model.y);
		};
		props.model.on("coordinateChanged", onCoordinateChanged);
		return (): void => {
			props.model.off("coordinateChanged", onCoordinateChanged);
		};
	}, [props.model]);

	return (
		<div className="plot-view">
			<div className="coordinate-dot" style={{ left: x - 2.5, top: y - 2.5 }}></div>
		</div>
	);
};
