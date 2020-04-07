import * as React from "react";
import { IViewProps } from "./provider.types";

export const PrimedContext: React.Context<IViewProps> = React.createContext(
  null
);

export const usePrimedContext = () => React.useContext(PrimedContext);
