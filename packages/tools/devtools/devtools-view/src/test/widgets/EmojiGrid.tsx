/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { Stack } from "@fluentui/react";
import { Spinner } from "@fluentui/react-components";

import { SharedMatrix } from "@fluidframework/matrix";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCell } from "@fluidframework/cell";
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
				<Stack.Item>
					<CellView cellHandle={cellHandle} />
				</Stack.Item>,
			);
		}
		renderedRows.push(
			<Stack.Item key={`emoji-grid-row${row}`}>
				<Stack horizontal>{renderedCells}</Stack>
			</Stack.Item>,
		);
	}

	return <Stack>{renderedRows}</Stack>;
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
