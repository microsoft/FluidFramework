import assert from "node:assert";
import type {
	ComposeNodeManager,
	InvertNodeManager,
	RebaseNodeManager,
} from "../../../feature-libraries/index.js";
import type { ChangeAtomId } from "../../../core/index.js";
import type { RangeQueryEntry } from "../../../util/rangeMap.js";

const failingDelegate = (): never => assert.fail("Should not be called");

export const failInvertManager: InvertNodeManager = {
	invertDetach: failingDelegate,
	invertAttach: failingDelegate,
};

export const failRebaseManager: RebaseNodeManager = {
	getNewChangesForBaseAttach: failingDelegate,
	rebaseOverDetach: failingDelegate,
	areSameRenamedNodes: failingDelegate,
};

export const failComposeManager: ComposeNodeManager = {
	getNewChangesForBaseDetach: failingDelegate,
	sendNewChangesToBaseSourceLocation: failingDelegate,
	composeAttachDetach: failingDelegate,
	composeDetachAttach: failingDelegate,
	areSameNodes: failingDelegate,
};
