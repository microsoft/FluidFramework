/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EditStatus, GenericTransaction } from '../../generic';
import { Snapshot } from '../../Snapshot';

/**
 * A mock implementation of `GenericTransaction` for use in tests.
 * @internal
 */
export class MockTransaction<TChange> extends GenericTransaction<TChange> {
	public static factory<TChange>(snapshot: Snapshot): MockTransaction<TChange> {
		return new MockTransaction<TChange>(snapshot);
	}

	protected validateOnClose(): EditStatus {
		return EditStatus.Applied;
	}

	protected dispatchChange(change: TChange): EditStatus {
		return EditStatus.Applied;
	}
}
