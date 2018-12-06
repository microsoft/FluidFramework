const docGetter = require("./src/main.js");

exports.handler = function(context, event) {
    var docId = event.body.toString();

    docGetter.setup(docId)
        .then((value) => {
            context.callback("Value: " + value);
        })
        .catch((error) => {
            context.callback("Error: " + error);
        })
};
