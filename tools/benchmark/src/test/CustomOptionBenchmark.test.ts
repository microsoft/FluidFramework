/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkCustom, ValueType, type CollectedData } from "..";
import { BenchmarkType } from "../Configuration";

describe("`benchmarkCustom` function", () => {
	benchmarkCustom({
		title: `test`,
		run: () => {
			return {
				primary: {
					value: 0,
					units: "custom units",
					name: "test",
					type: ValueType.SmallerIsBetter,
				},
				additional: [],
			} satisfies CollectedData;
		},
		type: BenchmarkType.OwnCorrectness,
	});
});
