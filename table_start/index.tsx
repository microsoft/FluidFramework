import { withData } from "./utils/withData";
import { App } from "./App";
import { PrimedContext } from "./provider";

export const initialState = { diceValue: 1, clicked: 1 };

export const fluidExport = withData(App, initialState, PrimedContext);
