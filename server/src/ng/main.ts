// The require here is deliberate. The TypeScript browserify will elide this line if 
// a standard import given no modules are used. We are including the polyfills so we pick
// them up with our browserify package.

// TODO - there likely is a cleaner way to include these polyfills
// tslint:disable-next-line:no-var-requires
let polyfills = require("./ngPolyfill");

import { platformBrowserDynamic } from "@angular/platform-browser-dynamic";
import { AppModule } from "./app.module";

const platform = platformBrowserDynamic();
platform.bootstrapModule(AppModule);
