import * as React from "react";
import { DefaultButton, Stack } from "office-ui-fabric-react";

const getDiceChar = (value: number) => {
  // Unicode 0x2680-0x2685 are the sides of a dice (⚀⚁⚂⚃⚄⚅)
  return String.fromCodePoint(0x267f + value);
};

export const Dice = props => {
  const { diceValue, rollDice } = props;
  return (
    <Stack verticalAlign="center" horizontal>
      <span style={{ fontSize: 50, marginRight: 50 }}>
        {getDiceChar(diceValue)}
      </span>
      <DefaultButton onClick={rollDice}>Roll</DefaultButton>
    </Stack>
  );
};
