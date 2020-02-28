import * as React from "react";
import { usePrimedContext } from "./provider";
import { DefaultButton, Stack } from "office-ui-fabric-react";
import { Count } from "./components/Count";

export const App = () => {
  const { diceValue, clicked, setClicked, setDiceValue } = usePrimedContext();

  const getDiceChar = (value: number) => {
    // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
    return String.fromCodePoint(0x267f + value);
  };

  const rollDice = () => {
    // tslint:disable-next-line:insecure-random - We don't need secure random numbers for this application.
    setDiceValue(Math.floor(Math.random() * 6) + 1);
    setClicked(clicked + 1);
  };

  return (
    <Stack verticalAlign="center" horizontal tokens={{ childrenGap: 8 }}>
      <span style={{ fontSize: 50, marginRight: 50 }}>
        {getDiceChar(diceValue)}
      </span>
      <DefaultButton onClick={rollDice}>Roll</DefaultButton>

      <Count />
    </Stack>
  );
};
