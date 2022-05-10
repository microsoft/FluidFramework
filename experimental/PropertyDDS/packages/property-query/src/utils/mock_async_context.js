/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

class MockAsyncContext {
    incrementInContext(key, count) {

    }

    runInNewContext(callback) {
        return callback();
    }

    getDBStats() {
        return {};
    }
}

module.exports = MockAsyncContext;
