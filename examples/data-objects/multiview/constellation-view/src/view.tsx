/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConstellation, ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { SliderCoordinateView } from "@fluid-example/multiview-slider-coordinate-view";
import React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

interface IStarViewProps {
	model: ICoordinate;
	onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
	onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
	onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
}

/**
 * StarView is a React component that renders a single coordinate as a dot (representing a star).
 * It also takes event listeners in its props to support drag/drop scenarios, which will be registered on the star.
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
		<div
			className="star"
			style={{ left: x - 2.5, top: y - 2.5 }}
			onPointerDown={props.onPointerDown}
			onPointerMove={props.onPointerMove}
			onPointerUp={props.onPointerUp}
		></div>
	);
};

interface IConstellationViewProps {
	model: IConstellation;
}

/**
 * ConstellationView is a React component that renders the given IConstellation's stars as dots that can be dragged
 * and dropped, plus slider views for more precise editing.  Note that the ConstellationView is the one making the
 * decision to bind the ICoordinate models to these particular views.
 * @internal
 */
export const ConstellationView: React.FC<IConstellationViewProps> = (
	props: IConstellationViewProps,
) => {
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

	const starViews: JSX.Element[] = [];
	const sliderViews: JSX.Element[] = [];
	for (const [index, star] of starList.entries()) {
		let dragging: boolean = false;
		const starStart = { x: star.x, y: star.y };
		const dragStart = { x: 0, y: 0 };
		const pointerDownHandler = (event) => {
			event.target.setPointerCapture(event.pointerId);
			starStart.x = star.x;
			starStart.y = star.y;
			dragStart.x = event.pageX;
			dragStart.y = event.pageY;
			dragging = true;
		};
		const pointerMoveHandler = (event) => {
			if (dragging) {
				const totalDragDelta = {
					x: event.pageX - dragStart.x,
					y: event.pageY - dragStart.y,
				};
				star.x = Math.min(Math.max(starStart.x + totalDragDelta.x, 0), 100);
				star.y = Math.min(Math.max(starStart.y + totalDragDelta.y, 0), 100);
			}
		};
		const pointerUpHandler = (event) => {
			dragging = false;
		};
		starViews.push(
			<StarView
				key={index}
				model={star}
				onPointerDown={pointerDownHandler}
				onPointerMove={pointerMoveHandler}
				onPointerUp={pointerUpHandler}
			/>,
		);
		sliderViews.push(
			<SliderCoordinateView key={index} model={star} label={`Star ${index}`} />,
		);
	}

	return (
		<div>
			<div className="constellation-view">{starViews}</div>
			<div className="slider-views">{sliderViews}</div>
		</div>
	);
};
