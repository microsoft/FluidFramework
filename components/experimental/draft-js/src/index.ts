export * from "./component";

import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";

import { getDefaultObjectFromContainer } from "@fluidframework/aqueduct";
import {
    DraftJsExample,
    DraftInstantiationFactory,
} from "./component";

// I'm choosing to put the docId in the hash just for my own convenience.  There should be no requirements on the
// page's URL format deeper in the system.
if (window.location.hash.length === 0) {
    window.location.hash = Date.now().toString();
}
const documentId = window.location.hash.substring(1);

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
async function start() {
    // Get the Fluid Container associated with the provided id
    const container = await getTinyliciousContainer(documentId, DraftInstantiationFactory);
    // Get the Default Object from the Container (DiceRoller)
    const defaultObject = await getDefaultObjectFromContainer<DraftJsExample>(container);

    // For now we will just reach into the component to render it
    defaultObject.render(document.getElementById("content"));

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line dot-notation
    window["fluidStarted"] = true;
}

start().catch((e)=> {
    console.error(e);
    console.log(
        "%cEnsure you are running the Tinylicious Fluid Server\nUse:`npm run start:server`",
        "font-size:30px");
});
