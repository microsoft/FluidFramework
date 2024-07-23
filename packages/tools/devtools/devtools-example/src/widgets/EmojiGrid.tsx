/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Spinner } from "@fluentui/react-components";
import type { ISharedCell } from "@fluidframework/cell/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import React from "react";

import { EmojiButton } from "./EmojiButton.js";

/**
 * {@link EmojiGrid} input props.
 * @internal
 */
export interface EmojiGridProps {
	emojiMatrix: SharedMatrix<IFluidHandle<ISharedCell<boolean>>>;
}

/**
 * A grid view, backed by a `SharedMatrix`, containing a series of {@link EmojiButton}s.
 * @internal
 */
export function EmojiGrid(props: EmojiGridProps): React.ReactElement {
	const { emojiMatrix } = props;

	const { rowCount, colCount } = emojiMatrix;

	const renderedRows: React.ReactElement[] = [];
	for (let row = 0; row < rowCount; row++) {
		const renderedCells: React.ReactElement[] = [];
		for (let col = 0; col < colCount; col++) {
			const cellHandle = emojiMatrix.getCell(row, col) as IFluidHandle<ISharedCell<boolean>>;
			renderedCells.push(
				<CellView key={`emoji-grid-cell-${row}-${col}`} cellHandle={cellHandle} />,
			);
		}
		renderedRows.push(<div key={`emoji-grid-row${row}`}>{renderedCells}</div>);
	}

	return <div>{renderedRows}</div>;
}

interface CellViewProps {
	cellHandle: IFluidHandle<ISharedCell<boolean>>;
}

function CellView(props: CellViewProps): React.ReactElement {
	const { cellHandle } = props;

	const [emojiCell, setEmojiCell] = React.useState<ISharedCell<boolean> | undefined>();

	React.useEffect(() => {
		cellHandle.get().then(setEmojiCell, (error) => {
			console.error("Error encountered loading SharedCell:", error);
			throw error;
		});
	}, [cellHandle, setEmojiCell]);

	return emojiCell === undefined ? <Spinner /> : <EmojiButton emojiCell={emojiCell} />;
}
