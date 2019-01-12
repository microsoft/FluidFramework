import { Suite } from "benchmark";
import { lis } from "../src/lis";
import { lis as patience } from "../test/patience";

const seq = [ 46, 88, 53, 56, 30, 42, 75, 37, 66, 9, 97, 52, 39, 90, 3, 34, 98, 25, 65, 17 ];

new Suite("longest increasing subsequence")
  .add(`lis`, () => lis(seq))
  .add(`patience`, () => patience(seq))
  .on("cycle", (event: any) => {
    console.log(String(event.target));
  })
  .on("error", (event: any) => {
    console.error(String(event.target.error));
  })
  .on("complete", (event: any) => {
    console.log(
      `Fastest is ${event.currentTarget.filter("fastest").map("name")}\n`
    );
  })
  .run();