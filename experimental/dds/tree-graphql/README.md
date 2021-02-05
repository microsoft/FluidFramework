# @fluid-experimental/tree-graphql

A prototype package which uses the @graphql-codegen library to automatically generate graphql types and resolvers that can read a SharedTree (see @fluid-experimental/tree) via a given graphql schema.

# Codegen

This repo includes an [example graphql schema called 'Pizza'](.\src\graphql-schemas\Pizza.ts) in the './src/graphql-schemas' folder. After running codegen, an associated output file will be generated in the './src/graphql-generated' folder. This behavior is customized by a [graphql-codegen plugin](https://graphql-code-generator.com/docs/custom-codegen/index) called [SharedTreePlugin](.\src\graphql-plugins\SharedTreePlugin.ts), and the codegen step itself is configured via the [codegen.yml](.\codegen.yml) file in the repo root.

# Usage

After running `npm run refresh`, run `npm run codegen` in this package, followed by a build. Then the tests in [SharedTreeQuerier.tests.ts](.\src\test\SharedTreeQuerier.tests.ts) can be run.
