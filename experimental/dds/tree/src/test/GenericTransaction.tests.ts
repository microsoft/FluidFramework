/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { EditStatus } from '../generic';
import { ReconciliationEdit } from '../ReconciliationPath';
import { initialSnapshotWithValidation } from './utilities/TestUtilities';
import { MockTransaction } from './utilities/MockTransaction';

describe('GenericTransaction', () => {
	it('does not read the reconciliation path when change resolution does not require it', () => {
		const trappedPath = new Proxy([] as ReconciliationEdit<unknown>[], {
			get: (target, prop): unknown => {
				expect('the path was read').equals('the path should not be read');
				return target[prop];
			},
		});
		const transaction = new MockTransaction<unknown>(initialSnapshotWithValidation);
		transaction.applyChanges([{}, {}], trappedPath);
		expect(transaction.status).equals(EditStatus.Applied);
	});
});
