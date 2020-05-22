import * as React from "react";

export const BadgeContext: React.Context<any> = React.createContext(undefined);

export const useBadgeContext = () => React.useContext(BadgeContext);
