---
uid: package-feed
---
# Fluid private NPM feed

Currently, our packages are published on our [VSTS npm feed](https://offnet.visualstudio.com/officenet/_packaging?_a=feed&feed=prague).

Here are the step to configure your machine to pull Fluid packages from there.

Prerequisites: [Node (with npm)](https://nodejs.org) installed

1. Install vsts-npm-auth
    `npm i -g vsts-npm-auth`

2. Add registry to the our scopes (globally per-user)

    ```text
    npm config set @microsoft:registry https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/
    npm config set @fluid-example:registry https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/
    ```

3. Auth with VSTS using vsts-npm-auth (Windows only, Linux/Mac instructions
   [here](https://docs.microsoft.com/en-us/azure/devops/artifacts/npm/npmrc?view=azure-devops&tabs=windows))

    `vsts-npm-auth -C %USERPROFILE%\.npmrc`

4. Start installing Fluid packages into your package

    `npm i @microsoft/fluid-container-runtime`


NOTE:

* You can add the registry setting to your project only instead of globally.
  Just add the follow to your .npmrc in the root of your NPM package:

    ```text
    @microsoft:registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/
    @fluid-example:registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/
    ```

  Then run vsts-npm-auth in the same directory with no argument.
