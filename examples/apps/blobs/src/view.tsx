/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { type FC, useEffect, useState } from "react";

import type { IBlobCollection, IBlobRecord } from "./container/index.js";

const randInt = (max: number): number => Math.floor(Math.random() * (max + 1));

// This creates an HTML Canvas element, draws some random circles into it, and returns a
// Blob representing that image.
const drawAPrettyPictureIntoBlob = async (): Promise<Blob> => {
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
			if (blob === null) {
				reject(new Error("Couldn't get a blob for the pretty picture"));
			} else {
				resolve(blob);
			}
		});
	});
};

// The view wants URLs for the stored blobs to render into img elements.
interface IBlobUrlRecord {
	id: string;
	url: string;
}

const idSort = (a: { id: string }, b: { id: string }): number =>
	a.id.localeCompare(b.id, "en", { sensitivity: "base" });

const blobRecordToBlobUrlRecord = ({ id, blob }: IBlobRecord): IBlobUrlRecord => {
	return {
		id,
		url: URL.createObjectURL(blob),
	};
};

export interface IBlobCollectionViewProps {
	blobCollection: IBlobCollection;
}

export const BlobCollectionView: FC<IBlobCollectionViewProps> = ({
	blobCollection,
}: IBlobCollectionViewProps) => {
	const [blobUrlRecords, setBlobUrlRecords] = useState(
		blobCollection
			.getBlobs()
			.map((blobRecord) => blobRecordToBlobUrlRecord(blobRecord))
			.sort(idSort),
	);

	useEffect(() => {
		const onBlobAdded = (blobRecord: IBlobRecord): void => {
			// Retaining the existing blob URLs prevents leaking them or needing to revoke them.
			// Setting the state to a new array triggers a re-render.
			setBlobUrlRecords((previousBlobs) =>
				[...previousBlobs, blobRecordToBlobUrlRecord(blobRecord)].sort(idSort),
			);
		};
		blobCollection.events.on("blobAdded", onBlobAdded);
		return () => {
			blobCollection.events.off("blobAdded", onBlobAdded);
		};
	}, [blobCollection]);

	const blobViews = blobUrlRecords.map(({ id, url }) => (
		<img key={id} src={url} style={{ border: "1px solid black", margin: "10px" }}></img>
	));

	const addBlob = (): void => {
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

	if (attach !== undefined && showAttach) {
		const onAttachClick = (): void => {
			attach();
			setShowAttach(false);
		};
		return (
			<div>
				<button onClick={onAttachClick}>Attach container</button>
			</div>
		);
	} else {
		return <></>;
	}
};
