When writing documentation - be it source-code documentation, wiki content, etc. - the following are best practices to keep in mind.

## Write from the second person

A consistent point of view helps documentation flow nicely.
And since our docs are aimed at some potential developer or customer, it is nice to address them directly.
In any given article, "you" should always refer to the same person/reader.
Don't use "you" to refer to a developer in one paragraph and use it to refer to an end-user or a network admininstrator somewhere else.

## Only write about supported functionality

Plans change.
Even if we intend to add support for some scenario in the future, it may not come to fruition.
It is best to keep our documentation scoped to only the things we support *right now*.

Note that it's okay to discuss *ideas* for future features or changes, but it needs to be made clear that this is not a promise.

## Don't introduce new terminology

It is imperative that we keep the Fluid Framework's barrier to entry as low as possible to make adoption easier.
Please avoid adding new terminology whenever possible.

For a list of existing Fluid terminology, see [here](https://fluidframework.com/docs/glossary/).

If you think you need to add something new to describe some new concept, it will need to be reviewed by the team.

## Define acronyms and abbreviations before use

Even if an acronym or abbreviation seems obvious to you, it may not for someone else.
To ensure our documentation is accessible, such terms need to be defined in a given documentation scope before being used.

Here we will define a "documentation scope" to be the scope at which the contents are consumed by the target audience.
For a Markdown document, this is a file/page.
For a source-code comment, this would be a single source-code comment block.

- Remember that our API docs are published for public consumption!
  So even if this means you have to repeat an acronym definition multiple times in a code file, it is important to do so for our end-customers.

For example:

```markdown
The SharedMap is a Distributed Data Structure (DDS) that...
```

After defining the acronym, it is completely fine to refer to `Distributed Data Structure`s as `DDS`s from then on, but not before being defined.
