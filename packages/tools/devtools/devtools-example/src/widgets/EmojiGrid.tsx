/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Spinner } from "@fluentui/react-components";

import { type SharedMatrix } from "@fluidframework/matrix";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { type SharedCell } from "@fluidframework/cell";
import { EmojiButton } from "./EmojiButton";

/**
 * {@link EmojiGrid} input props.
 */
export interface EmojiGridProps {
	emojiMatrix: SharedMatrix<IFluidHandle<SharedCell<boolean>>>;
}

/**
 * A grid view, backed by a `SharedMatrix`, containing a series of {@link EmojiButton}s.
 */
export function EmojiGrid(props: EmojiGridProps): React.ReactElement {
	const { emojiMatrix } = props;

	const { rowCount, colCount } = emojiMatrix;

	const renderedRows: React.ReactElement[] = [];
	for (let row = 0; row < rowCount; row++) {
		const renderedCells: React.ReactElement[] = [];
		for (let col = 0; col < colCount; col++) {
			const cellHandle = emojiMatrix.getCell(row, col) as IFluidHandle<SharedCell<boolean>>;
			renderedCells.push(
				<CellView key={`emoji-grid-cell-${row}-${col}`} cellHandle={cellHandle} />,
			);
		}
		renderedRows.push(<div key={`emoji-grid-row${row}`}>{renderedCells}</div>);
	}

	return <div>{renderedRows}</div>;
}

interface CellViewProps {
	cellHandle: IFluidHandle<SharedCell<boolean>>;
}

function CellView(props: CellViewProps): React.ReactElement {
	const { cellHandle } = props;

	const [emojiCell, setEmojiCell] = React.useState<SharedCell<boolean> | undefined>();

	React.useEffect(() => {
		cellHandle.get().then(setEmojiCell, (error) => {
			console.error("Error encountered loading SharedCell:", error);
			throw error;
		});
	}, [cellHandle, setEmojiCell]);

	return emojiCell === undefined ? <Spinner /> : <EmojiButton emojiCell={emojiCell} />;
}
