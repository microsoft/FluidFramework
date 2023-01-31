/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockLogger } from '@fluidframework/telemetry-utils';
import { IdCompressorLogger } from '../id-compressor';

describe('IdCompressorLogger', () => {
	it('emits events when enabled', () => {
		const mockLogger = new MockLogger();
		const enabledLogger = new IdCompressorLogger(mockLogger, true);

		enabledLogger.sendTelemetryEvent({
			eventName: 'shouldSend',
		});

		mockLogger.assertMatch([
			{
				eventName: 'shouldSend',
			},
		]);
	});

	it('does not emit events when disabled', () => {
		const mockLogger = new MockLogger();
		const enabledLogger = new IdCompressorLogger(mockLogger, false);

		enabledLogger.sendTelemetryEvent({
			eventName: 'shouldNotSend',
		});

		mockLogger.assertMatchNone([
			{
				eventName: 'shouldSend',
			},
		]);
	});
});
