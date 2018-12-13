const docGetter = require("./src/main.js");

exports.handler = function(context, event) {
    var body = JSON.parse(event.body.toString()); // Buffer -> String -> JSON
    const docId = body.DocumentId;
    const text = body.Text;
    const msPerChar = body.Time;
    // const paragraph = body.Paragraph;

    docGetter.setup(docId, text, msPerChar)
        .then((value) => {
            context.callback("Value: " + value);
        })
        .catch((error) => {
            context.callback("Error: " + error);
        })
};
