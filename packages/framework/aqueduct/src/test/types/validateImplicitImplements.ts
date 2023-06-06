import { PureDataObject } from "@fluidframework/aqueduct-previous";
import { IProvideInternalFluidReferenceInfo } from "../../data-objects/pureDataObject";

declare const x: PureDataObject;
declare function f(y: IProvideInternalFluidReferenceInfo): void;

f(x);
