import { IChaincodeComponent } from "@prague/runtime-definitions";

// tslint:disable-next-line:no-var-requires
const pkg = require("../package.json");

export const chaincodePackage = `${pkg.name}@${pkg.version}`;

/** Constructs a component type key from the given component constructor function. */
export function createComponentType(ctorFn: new () => IChaincodeComponent) {
    return `${chaincodePackage}:${ctorFn.name}`;
}
