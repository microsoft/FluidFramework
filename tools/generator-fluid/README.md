# Fluid Generator

Use this tool to quickly bootstrap a dice roller component example that uses the Fluid Framework. This tool can
also prepare your component for use in the Fluid Preview App via the SharePoint Tenant App Catalog.

## Setup

To set up, do these one time steps.

````shell
npm install -g yo

cd {path_to_cloned_repo}/tools/generator-fluid

npm install
npm link
````

You can now bootstrap a new dice roller component using the coommand `yo @microsoft/fluid`.

## Packaging your component for use in the Fluid Preview App

You can use the command `yo @microsoft/fluid:sppkg` to create and manage files needed to package your component for use
in the Fluid Preview App.

Note: This generator assumes your component follows the basic project layout created by `yo fluid`. If your project
layout differs, you may need to manually move files to appropriate places.

You should run the command in the root of your component's package; that is, wherever your `package.json` file is. The
generator will make the following changes to your component:

1. Several `dependencies` and `devDependencies` will be added to `package.json`. These are packages required by the
   SPPkg build tools.
1. New `sppkg` NPM tasks will be added to `package.json`. These tasks will help automate the building and packaging of
   SPPkg packages.
1. A `gulpfile.js` file will be added to your project root. Gulp is added as a `devDependency` to your project because
   the SPPkg build toolchain is Gulp-based.
1. A new manifest file called `Component.sppkg.manifest.json` will be created in `src/`. This file is used in the
   SharePoint App Catalog.
1. Several JSON files will be added to a new `config/` folder. These files are using by the SPPkg build tools.
1. [First run only] Entries will be added to your `.gitignore` file so temporary files are not inadvertently committed
   source history.
1. [First run only] Your `.npmrc` file will be updated to point to required feeds.

All of these files should be checked into source control.

You can run `yo @microsoft/fluid:sppkg` multiple times in the same project. Subsequent runs can be used to update
settings.

---

## NPM or VSTS Auth Issue and Private NPM Repositories

If you run into an auth issue, check that your `.npmrc` project file is configured correctly.

### Windows

https://www.npmjs.com/package/vsts-npm-auth

### Mac

* Navigate to our production npm repository https://offnet.visualstudio.com/officenet/_packaging?feed=prague&_a=feed
* Click the "Connect to feed" link
* Choose "npm"
* And then follow the steps provided. This involves adding a new line to your project's .npmrc as well as storing
  credentials to access the private repo on your machine.
* IMPORTANT NOTE: VSTS will give you a line like this to put into your .npmrc file:
  `registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/`

  You need to prefix that line with @prague in order to not force all package lookups to go to the Fluid registry. The
  line you add to your .npmrc file should actually look like this:
  `@microsoft:registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/`
