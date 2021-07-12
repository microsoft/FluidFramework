/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { EditStatus } from '../generic';
import { ReconciliationEdit } from '../ReconciliationPath';
import { AnchoredChange, PlaceAnchorSemanticsChoice, RangeAnchor, TransactionWithAnchors } from '../anchored-edits';
import { simpleTreeSnapshotWithValidation, left, right } from './utilities/TestUtilities';

describe('TransactionWithAnchors', () => {
	it('does not read the reconciliation path when change resolution does not require it', () => {
		const trappedPath = new Proxy([] as ReconciliationEdit<AnchoredChange>[], {
			get: (target, prop): unknown => {
				expect('the path was read').equals('the path should not be read');
				return target[prop];
			},
		});
		const transaction = new TransactionWithAnchors(simpleTreeSnapshotWithValidation);
		transaction.applyChanges(
			[
				AnchoredChange.detach(RangeAnchor.only(left, PlaceAnchorSemanticsChoice.BoundToNode)),
				AnchoredChange.detach(RangeAnchor.only(right, PlaceAnchorSemanticsChoice.BoundToNode)),
			],
			trappedPath
		);
		expect(transaction.status).equals(EditStatus.Applied);
	});
});
