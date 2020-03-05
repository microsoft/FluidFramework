import * as React from "react";

export const PrimedContext = React.createContext<any>({});

export const usePrimedContext = () => React.useContext(PrimedContext);
