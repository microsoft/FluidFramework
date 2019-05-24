# Fluid Generator

Use this tool to quickly bootstrap a counter chaincode example.

To set up, do these one time steps.
````bash
npm install -g yo

cd {path_to_cloned_repo}/Prague/tools/generator-fluid

npm install
npm link
````


You can now bootstrap a new counter chaincode at any time. 

Try it now.
````bash
yo fluid
````
---

## NPM or VSTS Auth Issue and Private NPM Repositories

If you run into an auth issue. Please set up your .npmrc.

#### Windows
https://www.npmjs.com/package/vsts-npm-auth

#### Mac

* Navigate to our production npm repository https://offnet.visualstudio.com/officenet/_packaging?feed=prague&_a=feed
* Click the "Connect to feed" link
* Choose "npm"
* And then follow the steps provided. This involves adding a new line to your project's .npmrc as well as storing credentials to access the private repo on your machine.
* IMPORTANT NOTE: VSTS will give you a line like this to put into your .npmrc file:
  `registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/`
  
  You need to prefix that line with @prague in order to not force all package lookups to go to the Prague/Fluid registry. The line you add to your .npmrc file should actually look like this:
  `@prague:registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/`
