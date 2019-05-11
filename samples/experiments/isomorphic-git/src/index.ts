import * as fs from "fs";
import * as git from "isomorphic-git";
import * as os from "os";
import * as path from "path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "test-"));
console.log(dir);

git.clone({
  depth: 10,
  dir,
  fs,
  ref: "master",
  singleBranch: true,
  url: "https://github.com/tanviraumi/packfile",
}).then(async () => {
  const res = fs.readdirSync(dir);
  console.log(res);
  console.log(await git.log({fs, dir}));
}, (err) => {
  console.log(err);
});
