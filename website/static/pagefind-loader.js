import * as pagefind from "/pagefind/pagefind.js";

globalThis.fluidFrameworkPagefind = pagefind;
globalThis.dispatchEvent(new Event("fluid-framework-pagefind-loaded"));
