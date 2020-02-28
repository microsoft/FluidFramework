import * as React from "react";
import { usePrimedContext } from "./provider";
import { DefaultButton, Stack } from "office-ui-fabric-react";
import { Counter } from "./components/Counter";

export const App = () => {
  const { selectors, actions } = usePrimedContext();
  const { diceValue } = selectors;
  const { rollDice } = actions;

  const getDiceChar = (value: number) => {
    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    return String.fromCodePoint(0x267f + value);
  };

  const onButtonClick = () => {
    // tslint:disable-next-line:insecure-random - We don't need secure random numbers for this application.
    rollDice(Math.floor(Math.random() * 6) + 1);
  };

  return (
    <Stack verticalAlign="center" horizontal tokens={{ childrenGap: 8 }}>
      <span style={{ fontSize: 50, marginRight: 50 }}>
        {getDiceChar(diceValue)}
      </span>
      <DefaultButton onClick={onButtonClick}>Roll</DefaultButton>
      <Counter />
    </Stack>
  );
};
