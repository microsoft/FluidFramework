import * as registerDebug from "debug";

export const debug = registerDebug("domstream:status");
export const debugDOM = registerDebug("domstream:dom");
export const debugPort = registerDebug("domstream:port");
export const debugPopup = registerDebug("domstream:popup");
