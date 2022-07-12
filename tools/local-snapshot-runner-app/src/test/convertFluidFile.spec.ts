/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from 'fs';
import { strict as assert } from "assert";
import { MockLogger } from "@fluidframework/telemetry-utils";
import { convertFluidFile } from '../convertFluidFile';

describe('convertFluidFile test', () => {
    it('input Fluid file is converted to expected txt output', () => {
        const logger = new MockLogger();

        const folderRoot = `${__dirname}/../../src/test`;

        const inputFileContent = fs.readFileSync(`${folderRoot}/inputFile.fluid`).toString();
        const expectedOutputFileContent = fs.readFileSync(`${folderRoot}/expectedOutput.txt`).toString();
        
        const outputFileContent = convertFluidFile(inputFileContent, 'test', logger);
        assert.strictEqual(outputFileContent, expectedOutputFileContent);
    });
});

