# @fluid-example/key-value-cache

Key-value-cache is a simple class that wraps Fluid’s SharedMap DDS. The class exposes a simple 'IKeyValue' interface for the host process to interact with. The class does not have a view, which makes this an ideal candidate for a Node.js host to load. Any service side Node.js process can load this class and utilize it as a highly available eventually consistent key-value cache. In terms of usage, a service developer can think of it as a limited functionality Redis HSET with high availability guarantee.

If you are unfamiliar with loading DDSes inside Node.js environment, check [this](https://github.com/microsoft/FluidFramework/tree/main/examples/hosts/node-host) loader example first. It demonstrates DDS loading in Node.js environment, and uses key-value-cache as an example. It also provides a simple CLI tool to interact with the loaded class.

Note that while a browser can load this class as well, the utility is very limited since there is no view to interact with.
