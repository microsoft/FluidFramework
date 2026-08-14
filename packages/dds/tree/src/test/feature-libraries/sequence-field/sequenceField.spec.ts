/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { testCompose } from "./compose.spec.js";
import { testFilterEdits } from "./filterEdits.spec.js";
import { testInvert } from "./invert.spec.js";
import { testMarkListFactory } from "./markListFactory.spec.js";
import { testRebase } from "./rebase.spec.js";
import { testRelevantRemovedRoots } from "./relevantRemovedRoots.spec.js";
import { testReplaceRevisions } from "./replaceRevisions.spec.js";
import {
	testComposedSandwichRebasing,
	testExamples,
	testRebaserAxioms,
	testSandwichComposing,
	testSandwichRebasing,
	testStateBasedRebaserAxioms,
} from "./sequenceChangeRebaser.spec.js";
import { testCodecs } from "./sequenceFieldCodecs.spec.js";
import { testEditor } from "./sequenceFieldEditor.spec.js";
import { testSnapshots } from "./sequenceFieldSnapshots.spec.js";
import { testToDelta } from "./sequenceFieldToDelta.spec.js";
import { testUtils } from "./sequenceFieldUtils.spec.js";
import { testGetNestedChanges } from "./sequenceGetNestedChanges.spec.js";

describe("SequenceField", () => {
	testEditor();
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
	testReplaceRevisions();
	testGetNestedChanges();
	testFilterEdits();
});
