/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useEffect, useState } from "react";

import { IBlobCollection } from "./container/index.js";

const randInt = (max: number) => Math.floor(Math.random() * (max + 1));

// This creates an HTML Canvas element, draws some random circles into it, and returns a
// Blob representing that image.
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
	// Annoyingly, canvas.toBlob is a callback-based API rather than returning a Promise.
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

export interface IBlobCollectionViewProps {
	blobCollection: IBlobCollection;
}

export const BlobCollectionView: FC<IBlobCollectionViewProps> = ({
	blobCollection,
}: IBlobCollectionViewProps) => {
	const [blobs, setBlobs] = useState([...blobCollection.getBlobs()]);

	useEffect(() => {
		const onBlobsChanged = () => {
			// Clone the array into a new reference to ensure we re-render.
			setBlobs([...blobCollection.getBlobs()]);
		};
		blobCollection.events.on("blobsChanged", onBlobsChanged);
		return () => {
			blobCollection.events.off("blobsChanged", onBlobsChanged);
		};
	}, [blobCollection]);

	const blobViews = blobs.map(({ id, blob }) => (
		<img
			key={id}
			// Note that since we create a new URL on every re-render the blobs' URLs will
			// appear to change on every re-render.  A little noisy, but not a real problem.
			src={URL.createObjectURL(blob)}
			style={{ border: "1px solid black", margin: "10px" }}
		></img>
	));

	const addBlob = () => {
		drawAPrettyPictureIntoBlob().then(blobCollection.addBlob).catch(console.error);
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

export interface IDebugViewProps {
	attach?: () => void;
}

export const DebugView: FC<IDebugViewProps> = ({ attach }) => {
	const [showAttach, setShowAttach] = useState<boolean>(attach !== undefined);
	const onAttachClick = () => {
		// We'll only show the button if the function exists.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		attach!();
		setShowAttach(false);
	};
	return showAttach ? (
		<div>
			<button onClick={onAttachClick}>Attach container</button>
		</div>
	) : (
		<></>
	);
};
