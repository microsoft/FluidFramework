/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const docGetter = require("./src/main.js");

exports.handler = function(context, event) {
    var body = JSON.parse(event.body.toString()); // Buffer -> String -> JSON
    const docId = body.DocumentId;
    const text = body.Text;
    const msPerChar = body.Time;
    const startMarker = body.Start;

    docGetter.setup(docId, text, msPerChar, startMarker)
        .then((value) => {
            context.callback("Value: " + value);
        })
        .catch((error) => {
            context.callback(error.toString());
        })
};
