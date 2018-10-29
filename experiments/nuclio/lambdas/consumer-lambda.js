/*
    Add trigger with url from kubectl get endpoints --namespace nuclio
    topic: Deltas (or whatever)
    paritions is a list of ints, but basically, which endpoints to listen to
*/

var request = require('request');

exports.handler = function(context, event) {
    // sub in your server address
    request('https://c54755c4.ngrok.io/increment', function (error, response, body) {
        console.log('error:', error); // Print the error if one occurred
        console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
        console.log('body:', body); // Print the HTML for the Google homepage.
    });

    context.callback(event);
};
