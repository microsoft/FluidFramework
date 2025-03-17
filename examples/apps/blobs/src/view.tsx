/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, type ReactElement, useEffect, useState } from "react";

import { IBlobMap } from "./container/index.js";

export interface IBlobMapViewProps {
	blobMap: IBlobMap;
}

export const BlobMapView: FC<IBlobMapViewProps> = ({ blobMap }: IBlobMapViewProps) => {
	const [blobs, setBlobs] = useState(blobMap.getBlobs());

	useEffect(() => {
		const onBlobsChanged = () => {
			setBlobs(blobMap.getBlobs());
		};
		blobMap.events.on("blobsChanged", onBlobsChanged);
		return () => {
			blobMap.events.off("blobsChanged", onBlobsChanged);
		};
	}, [blobMap]);

	const blobViews: ReactElement[] = [];
	for (const [id, blob] of blobs) {
		console.log(blob);
		blobViews.push(<div id={id}></div>);
	}

	const addBlob = () => {
		blobMap.addBlob(Uint8Array.from([1, 2, 3]));
	};

	return (
		<div>
			<button style={{ fontSize: "50px" }} onClick={addBlob}>
				Add blob
			</button>
			{blobViews}
		</div>
	);
};
