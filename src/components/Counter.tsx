import * as React from "react";
import { usePrimedContext } from "../provider";

export const Counter = () => {
  const {
    selectors: { clicked = 0 }
  } = usePrimedContext();
  return (
    <div>
      Clicked {clicked} time{clicked === 1 ? "" : "s"}
    </div>
  );
};
