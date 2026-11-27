/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";

import type { IFluidFileConverterWithBinaryOutput } from "../../codeLoaderBundle.js";

import { SampleCodeLoader } from "./sampleCodeLoader.js";

export const binaryExecuteResult = Uint8Array.from([0, 1, 127, 128, 255]);
export const racedOutput = Uint8Array.from([222, 173, 190, 239]);

export const fluidExport: IFluidFileConverterWithBinaryOutput = {
	getCodeLoader: async () => new SampleCodeLoader(),
	execute: async (_container, outputFileToRace?: string) => {
		if (outputFileToRace !== undefined) {
			fs.writeFileSync(outputFileToRace, racedOutput);
		}
		return binaryExecuteResult;
	},
};
