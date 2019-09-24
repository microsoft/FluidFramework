import { Plugin } from "prosemirror-state";

let counter = 0;

export const fluidPlugin = new Plugin({
    state: {
        init(config, instance) { return { hello: "KURT!" } },
        apply(tr, old) {
            console.log(JSON.stringify(tr.steps, null, 2));
            return { hello: `KURTB! ${counter++}` }
        }
    },
});
