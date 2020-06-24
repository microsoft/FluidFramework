# @fluid-example/key-value-cache

Key-value-cache component is a simple component that wraps Fluid’s Shared Map DDS. The component exposes a simple 'IkeyValue' interface for the host process to interact with. The component does not have a view, which makes this an ideal candidate for a Node.js host to load. Any service side Node.js process can load this component and utilize it as a highly available eventually consistent key-value cache. In terms of usage, a service developer can think of it as a limited functionality Redis HSET with high availability guarantee.

If you are unfamiliar with loading components inside Node.js environment, check [this](https://github.com/microsoft/FluidFramework/tree/master/examples/hosts/node) loader example first. It demonstrates component loading in Node.js environment, and uses key-value-cache as an example. It also provides a simple CLI tool to interact with the loaded component.

Note that while a browser can load this component as well, the utility is very limited since there is no view to interact with.
