import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { SharedCell } from "@microsoft/fluid-cell";
import { SharedDirectory, SharedMap } from "@microsoft/fluid-map";
import { ConsensusQueue, ConsensusStack } from "@microsoft/fluid-ordered-collection";
import { SharedNumberSequence, SharedObjectSequence, SparseMatrix } from "@microsoft/fluid-sequence";
import { MFxComponentFactory } from "@ms/mfx-part-base";
import { SudokuWebPart } from "./sudoku/SudokuWebPart";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const componentName = pkg.name as string;

// If you define multiple components in your module, you will need to create a factory for each component type.
const MFxInstantiationFactory = new MFxComponentFactory(
  SudokuWebPart,
  [
    SharedMap.getFactory(),
    SharedDirectory.getFactory(),
    SharedCell.getFactory(),
    SharedObjectSequence.getFactory(),
    SharedNumberSequence.getFactory(),
    SparseMatrix.getFactory(),
    ConsensusQueue.getFactory(),
    ConsensusStack.getFactory(),
  ]);

/**
 * This export provides the Fluid runtime the information it needs to instantiate your component. The
 * SimpleModuleInstantiationFactory class can be used to simplify this process. You need to provide the name of the
 * default component in your module, along with a registry of component names (strings) to factories that create the
 * component.
 *
 * The MFxComponentFactory class makes it easy to create factories for components that use BaseMFxComponent.
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
  componentName,
  new Map([
    [componentName, Promise.resolve(MFxInstantiationFactory)],
  ] as any),
);

// This export is the default WebPart in the module
export { SudokuWebPart as default } from './sudoku/SudokuWebPart';
