import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedMap } from "@microsoft/fluid-map";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";
import { DataModel } from "./FluidModel";

export const fluidExport = new PrimedComponentFactory(DataModel, [
  SharedMap.getFactory(),
  SharedObjectSequence.getFactory(),
]);
