/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISharedCell } from "@fluidframework/cell/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { useEffect, useState } from "react";

interface Props {
	serializer: () => Promise<string>;
	frequencyMs: number;
	sharedCellHandle: IFluidHandle<ISharedCell>;
}
export function useAppSerializer({ serializer, frequencyMs, sharedCellHandle }: Props): {
	serializedAppState?: string;
} {
	const [serializedAppState, setSerializedAppState] = useState<string | undefined>(undefined);

	useEffect(() => {
		const intervalId = setInterval(async () => {
			const newState = await serializer();
			setSerializedAppState(newState);
			const sharedCell = await sharedCellHandle.get();
			sharedCell.set(newState);
			console.log(sharedCell.get());
		}, frequencyMs);

		// Cleanup interval on component unmount
		return () => clearInterval(intervalId);
	}, []); // Empty dependency array ensures this effect runs only once after the initial render

	return {
		serializedAppState,
	};
}
