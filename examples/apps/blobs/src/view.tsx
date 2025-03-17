/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, type ReactElement, useEffect, useState } from "react";

import { IBlobMap } from "./container/index.js";

export interface IBlobMapViewProps {
	blobMap: IBlobMap;
}

const randInt = (max: number) => Math.floor(Math.random() * (max + 1));

const drawAPrettyPictureIntoBlob = async () => {
	const canvasElm = document.createElement("canvas");
	canvasElm.width = 200;
	canvasElm.height = 200;
	// We know this will be successful because it's a newly created canvas.
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const ctx = canvasElm.getContext("2d")!;
	for (let stroke = 0; stroke < 5; stroke++) {
		ctx.strokeStyle = `rgb(${randInt(255)}, ${randInt(255)}, ${randInt(255)})`;
		ctx.beginPath();
		ctx.arc(randInt(180) + 10, randInt(180) + 10, randInt(90) + 10, 0, 2 * Math.PI);
		ctx.stroke();
	}
	return new Promise<Blob>((resolve, reject) => {
		canvasElm.toBlob((blob) => {
			if (blob !== null) {
				resolve(blob);
			} else {
				reject(new Error("Couldn't get a blob for the pretty picture"));
			}
		});
	});
};

export const BlobMapView: FC<IBlobMapViewProps> = ({ blobMap }: IBlobMapViewProps) => {
	// TODO Creating a unique array just to ensure we get re-renders
	const [blobs, setBlobs] = useState([...blobMap.getBlobs()]);

	useEffect(() => {
		const onBlobsChanged = () => {
			setBlobs([...blobMap.getBlobs()]);
		};
		blobMap.events.on("blobsChanged", onBlobsChanged);
		return () => {
			blobMap.events.off("blobsChanged", onBlobsChanged);
		};
	}, [blobMap]);

	const blobViews: ReactElement[] = [];
	for (const { id, blob } of blobs) {
		const imgUrl = URL.createObjectURL(blob);
		blobViews.push(<img key={id} src={imgUrl}></img>);
	}

	const addBlob = () => {
		drawAPrettyPictureIntoBlob().then(blobMap.addBlob).catch(console.error);
	};

	return (
		<div>
			<div>
				<button onClick={addBlob}>Add blob</button>
			</div>
			{blobViews}
		</div>
	);
};
