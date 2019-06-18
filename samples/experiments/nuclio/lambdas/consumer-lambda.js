/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

var request = require('request');

exports.handler = function(context, event) {
    const op = JSON.parse(Buffer.from(event.body).toString());
    const docId = "DemoDocId";
    const baseURL = "https://8a4e0486.ngrok.io/";
    if (op.documentId === docId) {
        if (op.operation.type === "blobUploaded") {
            request({
                url: baseURL + "blobUploaded",
                method: "POST",
                json: true,
                body: op, 
            });
        } else {
            request({
                url: baseURL + "op",
                method: "POST",
                json: true,
                body: op, 
            });
        }
    } else {
        request({
            url: baseURL + "optwo",
            method: "POST",
            json: true,
            body: op, 
        });
    }
};
