import { IPendingBlobs } from "../blobManager";
import { IPendingLocalState } from "../pendingStateManager";

export interface PendingLocalState {
	pending: IPendingLocalState | undefined;
	pendingAttachmentBlobs: IPendingBlobs;
}
