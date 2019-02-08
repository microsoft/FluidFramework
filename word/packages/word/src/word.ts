/**
 * Debug Hack
 *
 * When we run as part of Word Win32, the chrome dev tools (and vscode, etc.)
 * crash when trying to debug the javascript. This appears to be a crash in
 * the piece of (native) code in the inspector implementation that hooks every
 * async operation. It uses that information to present sensible callstacks
 * when the program is stopped in the middle of an async function. While this
 * facility is very useful, by circumventing it we can have an actual debugging session
 * that doesn't crash.
 *
 * So if inspector exists, register two empty functions for the async hooks.
 *
 * This must happen really early in the lifetime of the file being read.
 */
const inspector = (process as any).binding("inspector");
if (inspector && inspector.registerAsyncHook) {
    const dummy = () => { return; };
    console.log("found inspector. Installing dummy async hooks to prevent debugger crashes");
    inspector.registerAsyncHook(dummy, dummy);
} else {
    console.log("did not find inspector. Not installing dummy async hooks.");
}

import { IWordApi, makeWordApi } from "./wordapi";

/**
 * onWordApiAvailable.
 *
 * The code in this module is expected to prepare an implementation of IWordApi
 * and call a function with this signature that is pre-populated by the
 * hosting environment into the global context.
 *
 * @param wordApi The instance of the API for the caller to use
 */
declare function onWordApiAvailable(wordApi: IWordApi): void;

/**
 * init
 *
 * The entry point into this file
 */
function init() {
    onWordApiAvailable(makeWordApi());
}

init();
