// Export the ink definition
import * as type from "./type";
export { type as type };

// And the other core types
export * from "./actions";
export * from "./core";
export * from "./delta";
export * from "./operations";
export * from "./snapshot";
export * from "./tools";

export * from "./extension";
import { IInk } from "./collabObject";
export { IInk };
