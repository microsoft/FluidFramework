# Import-Calc-Ts

Vet that '@ms/excel-online-calc' loads in node (via the 'esm' shim for ES6 modules)

Also tried:

```
> node --experimental-modules .\test.mjs
(node:16608) ExperimentalWarning: The ESM module loader is experimental.
file:///C:/gh/my/prague/experiments/danlehen/import-calc-ts/test.mjs:4
import { parse, config as cfg, formula } from '@ms/excel-online-calc/lib';
         ^^^^^
SyntaxError: The requested module '@ms/excel-online-calc/lib' does not provide an export named 'parse'
    at ModuleJob._instantiate (internal/modules/esm/module_job.js:80:21)
```

## Note:
* Only works on Windows.  (The npm preinstall script uses 'vsts-npm-auth' to authenticate w/the office-online-ui repo)
