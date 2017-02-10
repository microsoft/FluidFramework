import * as Quill from "quill";

export function register() {
    // One of the sample Quill modules as an example of a custom plugin
    Quill.register("modules/counter", (quill, options) => {
        let container = document.querySelector(options.container);
        quill.on("text-change", (delta, oldContents, source: String) => {
            let text = quill.getText();

            // There are a couple issues with counting words
            // this way but we"ll fix these later
            container.innerHTML = text.split(/\s+/).length;
        });
    });
}
