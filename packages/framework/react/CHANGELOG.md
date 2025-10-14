# @fluidframework/react

## 2.63.0

Dependency updates only.

## 2.62.0

### Minor Changes

- The exports of @fluid-experimental/tree-react-api have been moved to the new @fluidframework/react package and placed under its /alpha exports ([#25542](https://github.com/microsoft/FluidFramework/pull/25542)) [b388c7b7f1](https://github.com/microsoft/FluidFramework/commit/b388c7b7f18ba446f707b7eaea3caaf2c5bbaab5)

  `@fluid-experimental/tree-react-api` has been adjusted to align with Fluid Framework's [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).
  It has been renamed to `@fluidframework/react` and all existing APIs are now available under `@fluidframework/react/alpha`.

  Since this package was under `@fluid-experimental`, previously it implicitly made no guarantees.
  Now all the APIs are `@alpha`, which also amounts to making no guarantees but makes it possible to promote APIs to `@beta` in the future to offer some stability.

  To accommodate this change, all users of this package will need to adjust:

  - Package dependencies from `"@fluid-experimental/tree-react-api"` to `"@fluidframework/react"`.
  - Imports from `"@fluid-experimental/tree-react-api"` to `"@fluidframework/react/alpha"`.

- Added APIs for tracking observations of SharedTree content for automatic invalidation ([#25459](https://github.com/microsoft/FluidFramework/pull/25459)) [21d45d5948](https://github.com/microsoft/FluidFramework/commit/21d45d5948b961a82c77ed5154fc42e456d85ee4)

  `TreeAlpha.trackObservations` and `TreeAlpha.trackObservationsOnce` have been added.
  These provide a way to run some operation which reads content from [TreeNodes](https://fluidframework.com/docs/api/tree/treenode-class), then run a call back when anything observed by that operation changes.

  This functionality has also been exposed in the form of React hooks and React higher order components via the `@fluid-experimental/tree-react-api` package.
  It is now possible to use these utilities to implement React applications which pass TreeNodes in their props and get all necessary invalidation from tree changes handled automatically.
  The recommended pattern for doing this is to use `treeDataObject` or `TreeViewComponent` at the root, then `withTreeObservations` or `withMemoizedTreeObservations` for any sub-components which read from TreeNodes.
  Alternatively more localized changes can be made by using `PropNode` to type erase TreeNodes passed in props, then use one of the `usePropTreeNode` or `usePropTreeRecord` hooks to read from them.

  These APIs work with both hydrated and [un-hydrated](https://fluidframework.com/docs/api/tree/unhydrated-typealias) TreeNodes.

  #### React Support

  Here is a simple example of a React components which has an invalidation bug due to reading a mutable field from a TreeNode that was provided in a prop:

  ```typescript
  const builder = new SchemaFactory("example");
  class Item extends builder.object("Item", { text: SchemaFactory.string }) {}
  const ItemComponentBug = ({ item }: { item: Item }): JSX.Element => (
  	<span>{item.text}</span> // Reading `text`, a mutable value from a React prop, causes an invalidation bug.
  );
  ```

  This bug can now easily be fixed using `withTreeObservations` or `withMemoizedTreeObservations`:

  ```typescript
  const ItemComponent = withTreeObservations(
  	({ item }: { item: Item }): JSX.Element => <span>{item.text}</span>,
  );
  ```

  For components which take in TreeNodes, but merely forward them and do not read their properties, they can use `PropTreeNode` as shown:

  ```typescript
  const ItemParentComponent = ({ item }: { item: PropTreeNode<Item> }): JSX.Element => (
  	<ItemComponent item={item} />
  );
  ```

  If such a component reads from the TreeNode, it gets a compile error instead of an invalidation bug.
  In this case the invalidation bug would be that if `item.text` is modified, the component would not re-render.

  ```typescript
  const InvalidItemParentComponent = ({
  	item,
  }: { item: PropTreeNode<Item> }): JSX.Element => (
  	// @ts-expect-error PropTreeNode turns this invalidation bug into a compile error
  	<span>{item.text}</span>
  );
  ```

  To provide access to TreeNode content in only part of a component the `usePropTreeNode` or `usePropTreeRecord` hooks can be used.

  #### TreeAlpha.trackObservationsOnce Examples

  Here is a rather minimal example of how `TreeAlpha.trackObservationsOnce` can be used:

  ```typescript
  cachedFoo ??= TreeAlpha.trackObservationsOnce(
    () => {
      cachedFoo = undefined;
    },
    () => nodeA.someChild.bar + nodeB.someChild.baz,
  ).result;
  ```

  That is equivalent to doing the following:

  ```typescript
  if (cachedFoo === undefined) {
    cachedFoo = nodeA.someChild.bar + nodeB.someChild.baz;
    const invalidate = (): void => {
      cachedFoo = undefined;
      for (const u of unsubscribe) {
        u();
      }
    };
    const unsubscribe: (() => void)[] = [
      TreeBeta.on(nodeA, "nodeChanged", (data) => {
        if (data.changedProperties.has("someChild")) {
          invalidate();
        }
      }),
      TreeBeta.on(nodeB, "nodeChanged", (data) => {
        if (data.changedProperties.has("someChild")) {
          invalidate();
        }
      }),
      TreeBeta.on(nodeA.someChild, "nodeChanged", (data) => {
        if (data.changedProperties.has("bar")) {
          invalidate();
        }
      }),
      TreeBeta.on(nodeB.someChild, "nodeChanged", (data) => {
        if (data.changedProperties.has("baz")) {
          invalidate();
        }
      }),
    ];
  }
  ```

  Here is more complete example showing how to use `TreeAlpha.trackObservationsOnce` invalidate a property derived from its tree fields.

  ```typescript
  const factory = new SchemaFactory("com.example");
  class Vector extends factory.object("Vector", {
    x: SchemaFactory.number,
    y: SchemaFactory.number,
  }) {
    #length: number | undefined = undefined;
    public length(): number {
      if (this.#length === undefined) {
        const result = TreeAlpha.trackObservationsOnce(
          () => {
            this.#length = undefined;
          },
          () => Math.hypot(this.x, this.y),
        );
        this.#length = result.result;
      }
      return this.#length;
    }
  }
  const vec = new Vector({ x: 3, y: 4 });
  assert.equal(vec.length(), 5);
  vec.x = 0;
  assert.equal(vec.length(), 4);
  ```

## 2.61.0

Dependency updates only.

## 2.60.0

Dependency updates only.

## 2.53.0

Dependency updates only.

## 2.52.0

Dependency updates only.

## 2.51.0

Dependency updates only.

## 2.50.0

Dependency updates only.

## 2.43.0

Dependency updates only.

## 2.42.0

Dependency updates only.

## 2.41.0

### Minor Changes

- New experimental objectIdNumber API ([#21115](https://github.com/microsoft/FluidFramework/pull/21115)) [df2f139be8](https://github.com/microsoft/FluidFramework/commit/df2f139be8e8145d5eea313814cd6d35018cacee)

  A new `objectIdNumber` has been added, which is useful when you need an identifier which corresponds to an object identity.
  For example: when specifying a React "key" that corresponds to a `TreeNode`.

## 2.40.0

Dependency updates only.

## 2.33.0

Dependency updates only.

## 2.32.0

Dependency updates only.

## 2.31.0

### Minor Changes

- Simplify experimental tree data object implementation ([#23943](https://github.com/microsoft/FluidFramework/pull/23943)) [00a56b79b3](https://github.com/microsoft/FluidFramework/commit/00a56b79b3ba517d56bbde4421fee0cdbfe8af95)

  The experimental tree data object in `tree-react-api` has been simplified in a way that is incompatible with its previous version, which used `SharedDirectory` at the root.
  The library now leverages a new data object that uses the `SharedTree` directly at the root.
  In addition to breaking compatibility with existing documents, these changes include some related simplifications to the APIs which are also breaking:

  - Removes the `key` property from the data object configuration.
    This key was used to inform where the SharedTree was parented beneath the root SharedDirectory, so it no longer serves a purpose.
  - Inlined the `ITreeDataObject` interface into `IReactTreeDataObject`.

## 2.30.0

Dependency updates only.

## 2.23.0

Dependency updates only.

## 2.22.0

Dependency updates only.

## 2.21.0

Dependency updates only.

## 2.20.0

Dependency updates only.

## 2.13.0

Dependency updates only.

## 2.12.0

Dependency updates only.

## 2.11.0

Dependency updates only.

## 2.10.0

Dependency updates only.

## 2.5.0

Dependency updates only.

## 2.4.0

Dependency updates only.

## 2.3.0

Dependency updates only.

## 2.2.0

Dependency updates only.

## 2.1.0

Dependency updates only.

## 2.0.0-rc.5.0.0

### Minor Changes

- Update to TypeScript 5.4 ([#21214](https://github.com/microsoft/FluidFramework/pull/21214)) [0e6256c722](https://github.com/microsoft/FluidFramework/commit/0e6256c722d8bf024f4325bf02547daeeb18bfa6)

  Update package implementations to use TypeScript 5.4.5.

## 2.0.0-rc.4.0.0
