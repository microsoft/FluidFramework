# @fluid-example/example-webpack-integration

This package contains webpack configuration used by Fluid examples in the FluidFramework repo. These may only be used in the examples, and are not intended for use in production scenarios.

To use this package in an example, you must integrate the following into the webpack config:

1. Call `createExampleDriverServiceWebpackPlugin(service)`, which will return a webpack plugin to include. Service must be one of `"t9s"`, `"odsp"`, or `"local"`.  You may want to take this from the environment, such that you can choose the service when starting the dev server.

`webpack.config.cjs`:
```cjs
module.exports = (env) => {
	const { service } = env;

	return {
		// ...
		plugins: [
			// ...
			createExampleDriverServiceWebpackPlugin(service),
		],
		// ...
	};
}
```

`package.json`:
```json
"start": "npm run start:t9s",
"start:local": "webpack serve --env service=local",
"start:odsp": "webpack serve --env service=odsp",
"start:t9s": "webpack serve --env service=t9s",
```

2. If using odsp, also call `createOdspMiddlewares()` which will return an array of additional middlewares to include in `setupMiddlewares`. Push these on to the middleware array.

`webpack.config.cjs`:
```cjs
module.exports = (env) => {
	const { service } = env;

	return {
		// ...
		devServer: {
			// ...
			setupMiddlewares: (middlewares) => {
				if (service === "odsp") {
					middlewares.push(...createOdspMiddlewares());
				}
				return middlewares;
			},
		},
		// ...
	};
}
```

Then, follow the instructions from the `@fluidexample/example-driver` package's README to complete the integration.

See [GitHub](https://github.com/microsoft/FluidFramework) for more details on the Fluid Framework and packages within.

<!-- AUTO-GENERATED-CONTENT:START (README_FOOTER) -->

<!-- prettier-ignore-start -->
<!-- NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly. -->

## Contribution Guidelines

There are many ways to [contribute](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md) to Fluid.

-   Participate in Q&A in our [GitHub Discussions](https://github.com/microsoft/FluidFramework/discussions).
-   [Submit bugs](https://github.com/microsoft/FluidFramework/issues) and help us verify fixes as they are checked in.
-   Review the [source code changes](https://github.com/microsoft/FluidFramework/pulls).
-   [Contribute bug fixes](https://github.com/microsoft/FluidFramework/blob/main/CONTRIBUTING.md).

Detailed instructions for working in the repo can be found in the [Wiki](https://github.com/microsoft/FluidFramework/wiki).

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.
Use of these trademarks or logos must follow Microsoft’s [Trademark & Brand Guidelines](https://www.microsoft.com/trademarks).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

## Help

Not finding what you're looking for in this README? Check out [fluidframework.com](https://fluidframework.com/docs/).

Still not finding what you're looking for? Please [file an issue](https://github.com/microsoft/FluidFramework/wiki/Submitting-Bugs-and-Feature-Requests).

Thank you!

## Trademark

This project may contain Microsoft trademarks or logos for Microsoft projects, products, or services.

Use of these trademarks or logos must follow Microsoft's [Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).

Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.

<!-- prettier-ignore-end -->

<!-- AUTO-GENERATED-CONTENT:END -->
