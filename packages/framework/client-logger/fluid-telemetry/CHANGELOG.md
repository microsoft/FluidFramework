# @fluidframework/fluid-telemetry

## 2.0.0-rc.3.0.0

### Major Changes

-   New package: @fluidframework/fluid-telemetry ([#20553](https://github.com/microsoft/FluidFramework/issues/20553)) [35fd3e4b1c](https://github.com/microsoft/FluidFramework/commits/35fd3e4b1cb9bbe42ffdfdc11752b21088abe43d)

    Before deploying your application at scale, it is critical to have the holistic telemetry in place to monitor its usage
    and look for issues and optimizations. To make this easier, we are providing a fluid-telemetry package that comes with
    Typed telemetry events that you can funnel to your any analytics tool of your choice. If you decide to use Azure App
    Insights to view this data, we also provide helper packages and dashboard queries to get you started quickly. You can
    learn more at <https://aka.ms/fluid/telemetry>.

-   Packages now use package.json "exports" and require modern module resolution ([#20553](https://github.com/microsoft/FluidFramework/issues/20553)) [35fd3e4b1c](https://github.com/microsoft/FluidFramework/commits/35fd3e4b1cb9bbe42ffdfdc11752b21088abe43d)

    Fluid Framework packages have been updated to use the [package.json "exports"
    field](https://nodejs.org/docs/latest-v18.x/api/packages.html#exports) to define explicit entry points for both
    TypeScript types and implementation code.

    This means that using Fluid Framework packages require the following TypeScript settings in tsconfig.json:

    -   `"moduleResolution": "Node16"` with `"module": "Node16"`
    -   `"moduleResolution": "Bundler"` with `"module": "ESNext"`

    We recommend using Node16/Node16 unless absolutely necessary. That will produce transpiled JavaScript that is suitable
    for use with modern versions of Node.js _and_ Bundlers.
    [See the TypeScript documentation](https://www.typescriptlang.org/tsconfig#moduleResolution) for more information
    regarding the module and moduleResolution options.

    **Node10 moduleResolution is not supported; it does not support Fluid Framework's API structuring pattern that is used
    to distinguish stable APIs from those that are in development.**
