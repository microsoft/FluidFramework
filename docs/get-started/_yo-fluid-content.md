Use yo fluid to get set up quickly.

First, [clone the Fluid repo locally](../index.md#fluid-source).

Once you've cloned the repo, you can set up the `yo fluid` bootstrapper:

```text
npm install -g yo
cd /FluidFramework/tools/generator-fluid
npm install
npm link
```

Yo fluid is now ready. Use it to scaffold a new component!

```text
yo fluid
```

> [!TIP]
> if you get an error when running `yo fluid` saying that a generator cannot be found, try using `yo @microsoft/fluid` instead.

Now you're ready to <xref:build-a-component>!
