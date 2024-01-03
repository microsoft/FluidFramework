/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testCompose } from "./compose.test.js";
import { testInvert } from "./invert.test.js";
import { testMarkListFactory } from "./markListFactory.test.js";
import { testMarkQueue } from "./markQueue.test.js";
import { testGenerateRandomChange } from "./randomChangeGenerator.test.js";
import { testRebase } from "./rebase.test.js";
import { testRelevantRemovedRoots } from "./relevantRemovedRoots.test.js";
import {
	testComposedSandwichRebasing,
	testExamples,
	testRebaserAxioms,
	testSandwichComposing,
	testSandwichRebasing,
	testStateBasedRebaserAxioms,
} from "./sequenceChangeRebaser.test.js";
import { testCodecs } from "./sequenceFieldCodecs.test.js";
import { testEditor } from "./sequenceFieldEditor.test.js";
import { testToDelta } from "./sequenceFieldToDelta.test.js";
import { testSnapshots } from "./sequenceFieldSnapshots.test.js";
import { testUtils } from "./sequenceFieldUtils.test.js";

describe("SequenceField", () => {
	testEditor();
	testGenerateRandomChange();
	testMarkQueue();
	testUtils();
	testMarkListFactory();
	testInvert();
	testRebase();
	testCompose();
	testToDelta();
	testRelevantRemovedRoots();
	testRebaserAxioms();
	testStateBasedRebaserAxioms();
	testSandwichRebasing();
	testSandwichComposing();
	testComposedSandwichRebasing();
	testExamples();
	testCodecs();
	testSnapshots();
});
