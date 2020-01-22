---
uid: yo-fluid
---

# yo fluid

yo fluid is a tool that helps create a scaffold for a Fluid component.

First, [clone the Fluid Framework repo locally](./README.md#fluid-repo).

Once you've cloned the repo, you can set up the `yo fluid` bootstrapper:

```text
npm install -g yo
cd /FluidFramework/tools/generator-fluid
npm install
npm link
```

This will install yo fluid along with its dependency, [Yeoman](https://yeoman.io/).

Yo fluid is now ready. Use it to scaffold a new component by typing `yo fluid` and following the instructions.

> [!TIP]
> if you get an error when running `yo fluid` saying that a generator cannot be found, try using `yo @microsoft/fluid` instead.

## Next steps

Now that you've used yo fluid to scaffold a new component, you should examine the contents of the yo fluid output.

Or you can jump right in to [building your own component](xref:build-a-component) using the scaffold as a base.


## Anatomy of the yo fluid scaffold

See <xref:yo-fluid-details>

Now you're ready to <xref:build-a-component>!


> [!TIP]
> For yo fluid setup issues see [this question on Microsoft Stack
> Overflow](https://stackoverflow.microsoft.com/questions/137930/npm-install-fails-with-auth-issues/137931#137931)


## Source code

The source code for the yo fluid generator can be found at
<https://github.com/Microsoft/FluidFramework/blob/master/tools/generator-fluid/>.
