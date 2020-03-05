---
uid: yo-fluid
---

# yo fluid

**yo fluid** is a tool that helps create a scaffold for a Fluid component called **diceroller**.

<style>
  iframe#diceroller {
    height: 95px;
    width: 200px;
  }
</style>

<iframe id="diceroller" src="/fluid/diceroller.html"></iframe>


## Installing the `yo fluid` generator

There are two way to get the generator locally

### Installing just the generator

Good if you just want to build Fluid Components and don't plan on making changes to the Fluid Framework repo.

#### Create a .npmrc file somewhere on your computer

<CodeSwitcher :languages="{win:'Windows'}">
<template v-slot:win>

::: tip

Personal Desktop works well

Don't put it directly on your C root or it will do bad things to any other .npmrc you have on your computer

:::

</template>
<template v-slot:mac>

::: tip

Personal Desktop works well

:::

</template>
</CodeSwitcher>

Place the following text into the `.npmrc`:

```text
registry=https://offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/

always-auth=true
```

#### Auth yourself against the offnet registry by running

<CodeSwitcher :languages="{win:'Windows',mac:'macOS/Linux'}">
<template v-slot:win>

install `vsts-npm-auth` then run it against the `.npmrc`

```script
npm install -g vsts-npm-auth
```

```script
vsts-npm-auth -c "C:\Users\{your-user-id}\Desktop\.npmrc"
```

</template>
<template v-slot:mac>

Follow the instructions below. These can also be found at https://offnet.visualstudio.com/officenet/_packaging?_a=connect&feed=prague

```text
Step 1
Copy the code below to your user .npmrc.

; begin auth token
//offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/:username=offnet
//offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/:_password=[BASE64_ENCODED_PERSONAL_ACCESS_TOKEN]
//offnet.pkgs.visualstudio.com/_packaging/prague/npm/registry/:email=npm requires email to be set but doesn't use the value
//offnet.pkgs.visualstudio.com/_packaging/prague/npm/:username=offnet
//offnet.pkgs.visualstudio.com/_packaging/prague/npm/:_password=[BASE64_ENCODED_PERSONAL_ACCESS_TOKEN]
//offnet.pkgs.visualstudio.com/_packaging/prague/npm/:email=npm requires email to be set but doesn't use the value
; end auth token

Step 2
Generate a personal access token with Packaging read & write scopes.

Step 3
Base64 encode the personal access token from Step 2.

One safe and secure method of Base64 encoding a string is to:

1. From a command/shell prompt run:
node -e "require('readline') .createInterface({input:process.stdin,output:process.stdout,historySize:0}) .question('PAT> ',p => { b64=Buffer.from(p.trim()).toString('base64');console.log(b64);process.exit(); })"

2. Paste your personal access token value and press Enter/Return
3. Copy the Base64 encoded value
Step 4
Replace both [BASE64_ENCODED_PERSONAL_ACCESS_TOKEN] values in your user .npmrc file with your Base64 encoded personal access token from Step 3.
```

</template>
</CodeSwitcher>

#### Set your registry to FluidDeveloperProgram

```script
npm set registry https://pkgs.dev.azure.com/FluidDeveloperProgram/af93f492-1e56-4fc8-b7c0-9bea4d604c75/_packaging/packages/npm/registry/
```

#### Install yo fluid generator globally

```script
npm install -g @microsoft/generator-fluid
```


#### Reset your registry

Reset your npm registry back to the default `npmjs.org`.

```script
reset registry ---- npm set registry https://registry.npmjs.org/
```

### Using the Fluid Framework repo

Good if you already have a Fluid Framework enlistment or want to also make changes to the repo.

First, [clone the Fluid Framework repo locally](https://github.com/microsoft/FluidFramework).

Once you've cloned the repo, you can set up the `yo fluid` generator by installing and linking it:

<CodeSwitcher :languages="{win:'Windows',mac:'macOS/Linux'}">
<template v-slot:win>

```win
npm install -g yo
cd .\FluidFramework\tools\generator-fluid
npm install
npm link
```

</template>
<template v-slot:mac>

```mac
npm install -g yo
cd ./FluidFramework/tools/generator-fluid
npm install
npm link
```

</template>
</CodeSwitcher>

This will install yo fluid along with its dependency, [Yeoman](https://yeoman.io/).

## Run the `yo fluid` generator

Yo fluid is now ready to use!

1. Navigate to a root directory
2. Run `yo @microsoft/fluid` and follow the instructions.

::: tip

For yo fluid setup issues see [this question on Microsoft Stack
Overflow](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)

:::


## Next steps

Now that you've used yo fluid to scaffold a new component, you should examine the contents of the yo fluid output, which
is a sample component called **diceroller**. See the [Dice roller tutorial](../examples/dice-roller.md) for a
step-by-step explanation of the code.

Or you can jump right in to building your own component using the scaffold as a base.

## Source code

The source code for the yo fluid generator can be found at
<https://github.com/Microsoft/FluidFramework/blob/master/tools/generator-fluid/>.
