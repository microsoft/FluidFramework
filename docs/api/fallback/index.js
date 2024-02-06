/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

module.exports = async function (context, req) {
    context.res.json({
        text: "Hello from the API"
    });
};