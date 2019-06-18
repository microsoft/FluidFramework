/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const nodemailer = require('nodemailer');
const stringify = require('json-stringify-safe');

exports.handler = function(context, event) {
    const op = JSON.parse(Buffer.from(event.body).toString());
    const docId = "NuclioMailerDemo";
    if (op.documentId === docId) {

        nodemailer.createTestAccount((err, account) => {
            if (err) {
                console.error('Failed to create a testing account. ' + err.message);
                return process.exit(1);
            }
            
            // Create a SMTP transporter object
            const transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                auth: {
                    user: 'ydeztohrpn3fvcfe@ethereal.email',
                    pass: 'Cs9gwYCsDpnwZsKa2x'
                }
            });
            var imgUrl = "No URL";
            if (!(op.operation.contents == null || op.operation.contents.url == null)) {
                imgUrl = op.operation.contents.url;
            }
        
            // Message object
            let message = {
                from: 'Sender Name <sender@example.com>',
                to: 'Recipient <recipient@example.com>',
                subject: 'Nodemailer is unicode friendly ✔',
                text: 'Hello to myself!\n\n' + stringify(op),
                html: '<p><b>Hello</b> to myself! <br><br>'+ stringify(op) + '</p>'
            };
        
            transporter.sendMail(message, (err, info) => {
                if (err) {
                    console.log('Error occurred. ' + err.message);
                    return process.exit(1);
                }
        
                console.log('Message sent: %s', info.messageId);
                // Preview only available when sending through an Ethereal account
                console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
            });
        });
    }
};

