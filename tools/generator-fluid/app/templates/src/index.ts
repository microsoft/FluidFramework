import { DiceRoller } from "./component"

export { DiceRoller };

/**
 * Having a fluidExport that points to our factory allows for dynamic component
 * loading.
 */
export const fluidExport = DiceRoller.factory;