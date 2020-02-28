import * as React from "react";
import { usePrimedContext } from "../provider";

export const Count = () => {
  const { clicked } = usePrimedContext();

  return <div> Clicked {clicked} times </div>;
};
