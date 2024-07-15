/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConstellationView } from "@fluid-example/multiview-constellation-view";
import { IConstellation, ICoordinate } from "@fluid-example/multiview-coordinate-interface";
import { PlotCoordinateView } from "@fluid-example/multiview-plot-coordinate-view";
import { SliderCoordinateView } from "@fluid-example/multiview-slider-coordinate-view";
import { TriangleView } from "@fluid-example/multiview-triangle-view";
import * as React from "react";

// eslint-disable-next-line import/no-unassigned-import
import "./style.css";

/**
 * Our default view demos two scenarios - one basic that takes a single coordinate, and one triangle that takes 3.
 */
interface IDefaultViewProps {
	simpleCoordinate: ICoordinate;
	triangleCoordinate1: ICoordinate;
	triangleCoordinate2: ICoordinate;
	triangleCoordinate3: ICoordinate;
	constellation: IConstellation;
}

/**
 * In this sample, we (the container author) are choosing to bring along our own view that composes several
 * component views together.  We could have alternatively built a "base" component to do this composition if we had
 * preferred - either works fine.
 */
export const DefaultView: React.FC<IDefaultViewProps> = (props: IDefaultViewProps) => {
	return (
		<div>
			<div>
				<h2 className="scenario-header">
					Scenario 1: Linking a single model to multiple views
				</h2>
				<SliderCoordinateView model={props.simpleCoordinate} label="Simple Coordinate" />
				<PlotCoordinateView model={props.simpleCoordinate} />
			</div>
			<div>
				<h2 className="scenario-header">Scenario 2: Using multiple models in a single view</h2>
				<SliderCoordinateView model={props.triangleCoordinate1} label="Triangle pt1" />
				<SliderCoordinateView model={props.triangleCoordinate2} label="Triangle pt2" />
				<SliderCoordinateView model={props.triangleCoordinate3} label="Triangle pt3" />
				<TriangleView
					coordinate1={props.triangleCoordinate1}
					coordinate2={props.triangleCoordinate2}
					coordinate3={props.triangleCoordinate3}
				/>
			</div>
			<div>
				<h2 className="scenario-header">
					Scenario 3: Linking a nested view to a nested model
				</h2>
				<ConstellationView model={props.constellation} />
			</div>
		</div>
	);
};
