/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const adder = require("./adder.js");
var moment = require('moment');

exports.handler = function(context, event) {
    var body = event.body.toString(); // event.body is a Buffer
    context.logger.info('reversing: ' + body);
    body = adder.adder(body);
    body = body.split('').reverse().join('');
    body = "reversed@" + moment().format() + ": " + body;
    context.callback(body);
};
