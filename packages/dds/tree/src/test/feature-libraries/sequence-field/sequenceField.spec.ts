/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testCompose } from "./compose.spec";
import { testInvert } from "./invert.spec";
import { testMarkListFactory } from "./markListFactory.spec";
import { testMarkQueue } from "./markQueue.spec";
import { testGenerateRandomChange } from "./randomChangeGenerator.spec";
import { testRebase } from "./rebase.spec";
import { testRelevantRemovedRoots } from "./relevantRemovedRoots.spec";
import {
	testComposedSandwichRebasing,
	testExamples,
	testRebaserAxioms,
	testSandwichComposing,
	testSandwichRebasing,
	testStateBasedRebaserAxioms,
} from "./sequenceChangeRebaser.spec";
import { testCodecs } from "./sequenceFieldCodecs.spec";
import { testEditor } from "./sequenceFieldEditor.spec";
import { testToDelta } from "./sequenceFieldToDelta.spec";
import { testSnapshots } from "./snapshots.spec";
import { testUtils } from "./utils.spec";

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
