/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EditStatus, GenericTransaction } from '../../generic';
import { RevisionView } from '../../TreeView';

/**
 * A mock implementation of `GenericTransaction` for use in tests.
 * @internal
 */
export class MockTransaction<TChange> extends GenericTransaction<TChange> {
	public static factory<TChange>(view: RevisionView): MockTransaction<TChange> {
		return new MockTransaction<TChange>(view);
	}

	protected validateOnClose(): EditStatus {
		return EditStatus.Applied;
	}

	protected dispatchChange(change: TChange): EditStatus {
		return EditStatus.Applied;
	}
}
