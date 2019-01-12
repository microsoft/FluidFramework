import { Suite } from "benchmark";

new Suite("(name))")
  .add(`(nop)`, () => {})
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