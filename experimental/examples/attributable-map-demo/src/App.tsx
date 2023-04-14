/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useState } from "react";
import { AttributableMap } from "@fluid-experimental/attributable-map";
import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";
import { AttributionKey } from "@fluidframework/runtime-definitions";
import {
	AttributableMapPageContainerRuntimeFactory,
	IAttributableMapPageAppModel,
} from "./container";

const timeKey = "time-key";

const getMyMap = async () => {
	const tinyliciousModelLoader = new TinyliciousModelLoader<IAttributableMapPageAppModel>(
		new StaticCodeLoader(new AttributableMapPageContainerRuntimeFactory()),
	);

	let id: string;
	let model: IAttributableMapPageAppModel;

	if (location.hash.length === 0) {
		const createResponse = await tinyliciousModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.substring(1);
		model = await tinyliciousModelLoader.loadExisting(id);
	}

	// update the browser URL and the window title with the actual container ID
	location.hash = id;
	document.title = id;

	return model.attributableMapPage.map;
};

const App: React.FC = () => {
	const [fluidMap, setFluidMap] = useState<AttributableMap>();
	useEffect(() => {
		void getMyMap().then((myMap) => setFluidMap(myMap));
	}, []);

	const [viewData, setViewData] = useState<{ time?: string; attribution?: AttributionKey }>();
	useEffect(() => {
		if (fluidMap !== undefined) {
			// sync Fluid data into view state
			const syncView = () => {
				const value = fluidMap.get(timeKey);
				console.log("value:", value);
				setViewData({ time: value?.time, attribution: value?.attribution });
			};
			// update state each time our map changes
			fluidMap.on("valueChanged", syncView);
			syncView();
			// turn off listener when component is unmounted
			return () => {
				fluidMap.off("valueChanged", syncView);
			};
		}
	}, [fluidMap]);

	if (!viewData) return <div />;

	// business logic could be passed into the view via context
	const setTime = () => {
		const attribution = fluidMap?.getAttribution(timeKey);
		const newValue = { time: Date.now().toString(), attribution };
		fluidMap?.set(timeKey, newValue);
	};

	return (
		<div>
			<button onClick={setTime} className="click">
				{" "}
				click{" "}
			</button>
			<span className="time">{viewData.time}</span>
			<span className="attribution">{JSON.stringify(viewData.attribution)}</span>
		</div>
	);
};

// eslint-disable-next-line import/no-default-export
export default App;
