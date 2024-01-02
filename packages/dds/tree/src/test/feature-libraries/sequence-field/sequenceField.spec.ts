/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testCompose } from "./compose.test";
import { testInvert } from "./invert.test";
import { testMarkListFactory } from "./markListFactory.test";
import { testMarkQueue } from "./markQueue.test";
import { testGenerateRandomChange } from "./randomChangeGenerator.test";
import { testRebase } from "./rebase.test";
import { testRelevantRemovedRoots } from "./relevantRemovedRoots.test";
import {
	testComposedSandwichRebasing,
	testExamples,
	testRebaserAxioms,
	testSandwichComposing,
	testSandwichRebasing,
	testStateBasedRebaserAxioms,
} from "./sequenceChangeRebaser.test";
import { testCodecs } from "./sequenceFieldCodecs.test";
import { testEditor } from "./sequenceFieldEditor.test";
import { testToDelta } from "./sequenceFieldToDelta.test";
import { testSnapshots } from "./sequenceFieldSnapshots.test";
import { testUtils } from "./sequenceFieldUtils.test";

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
