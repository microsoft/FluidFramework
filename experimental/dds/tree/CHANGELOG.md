# @fluid-experimental/tree

## 2.0.0-internal.5.3.0

### Minor Changes

-   Move closeAndGetPendingLocalState to IContainerExperimental ([#16302](https://github.com/microsoft/FluidFramework/issues/16302)) [93151af787](https://github.com/microsoft/FluidFramework/commits/93151af787b76e547cf3460df47f81832131db8c)

    This change deprecates the experimental method closeAndGetPendingLocalState on IContainer and moves it to IContainerExperimental.
    IContainerExperimental is an interface that is easily casted to, which enables partners to access experimental features for testing and evaluation.
    Moving the experimental method off IContainer will reduce exposure and churn on that production interface as we iterate on and finalize our experimental features.
    Experimental features should not be used in production environments.

## 2.0.0-internal.5.2.0

Dependency updates only.

## 2.0.0-internal.5.1.0

Dependency updates only.

## 2.0.0-internal.5.0.0

Dependency updates only.

## 2.0.0-internal.4.4.0

Dependency updates only.

## 2.0.0-internal.4.1.0

Dependency updates only.
