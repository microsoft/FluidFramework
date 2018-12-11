const docGetter = require("./src/main.js");

exports.handler = function(context, event) {
    var body = JSON.parse(event.body.toString());
    const docId = body.DocumentId;
    const text = body.Text;

    docGetter.setup(docId, text)
        .then((value) => {
            context.callback("Value: " + value);
        })
        .catch((error) => {
            context.callback("Error: " + error);
        })
};
