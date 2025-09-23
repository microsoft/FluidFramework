/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface ISliderCoordinateViewProps {
	label: string;
	model: ICoordinate;
}

// eslint-disable-next-line jsdoc/require-description
/**
 * @internal
 */
export const SliderCoordinateView: React.FC<ISliderCoordinateViewProps> = (
	props: ISliderCoordinateViewProps,
) => {
	const [x, setX] = React.useState(props.model.x);
	const [y, setY] = React.useState(props.model.y);

	React.useEffect(() => {
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
		<div className="slider-view">
			<h3 className="slider-label">{props.label}</h3>
			<div>
				X:
				<input
					type="range"
					onChange={(e): void => {
						props.model.x = Number.parseInt((e.target as HTMLInputElement).value, 10);
					}}
					value={x}
				/>
				{Math.trunc(x)}
			</div>
			<div>
				Y:
				<input
					type="range"
					onChange={(e): void => {
						props.model.y = Number.parseInt((e.target as HTMLInputElement).value, 10);
					}}
					value={y}
				/>
				{Math.trunc(y)}
			</div>
		</div>
	);
};
