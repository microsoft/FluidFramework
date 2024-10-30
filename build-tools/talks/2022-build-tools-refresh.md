---
marp: true
theme: gaia

---
<style>
 :root {
  --color-background: #fff;
  --color-foreground: #333;
  --color-highlight: #f96;
  --color-dimmed: #888;
 }
</style>

<!-- _class: lead -->

# Fluid repo tools refresh

Tyler Butler
tylerbu@microsoft.com

July 2022

---

<!-- _class: lead -->

# beware

This presentation contains **opinion**.
It employs **hyperbole**
for both **humor**
and **effect**.

---

# Setting the stage

My first task when taking over the Fluid build tools was to get us to a point where we could release 1.0 of the Azure Fluid Relay-related packages.

---

# Setting the stage

I figured the best starting point was to massage the existing tools so that they worked well enough that we could release 1.0 – which we did. But I **really** struggled with the code. In many cases I could tell what it was doing but not why, so I felt like I couldn't remove anything.

We were also trying to develop a new sustainable release process and version policy while I was struggling to understand the code that encoded the _old_ release process.

---

# First impressions

**Whoa that's a lot of argument parsing code!**

Argument parsing falls into the category of "junk code." Junk code is code that isn't really important to the purpose of the program. It may be necessary, but it's not interesting.

---

# First impressions

Inevitably, as requirements change and the code needs updating, the code quickly gets complex.

Moreover, many tools have almost as much argument parsing code as "real code," which makes it all the more difficult to discern what matters in the code.

Rarely do people step back and redesign the basics as the code grows. Instead, people add what they need, and only that. Nothing's removed, only added, out of fear or lack of time.

---

> **Use a command-line argument parsing library where you can.** Either your language's built-in one, or a good third-party one. They will normally handle arguments, flag parsing, help text, and even spelling suggestions in a sensible way.
>
> <cite>[CLIG, The Basics](https://clig.dev/#the-basics)</cite>

---

# Other first impressions

Wait… is the only code that's tested the only code that's unused?

Why does every tool have a different set of flags and arguments?

---

<!-- _class: lead -->

I wanted to make sure that when the _Next Tyler_ arrived in build-tools, they wouldn't look around in horror the same way I did.

---

# But was there really a problem?

Each tool had a well-defined purpose.

Each tool worked – they did the thing they were intended to do. Sure, they were inconsistent, but they worked.

So why change?

---

# Consistency is a feature

With so many different styles and design philosophies on display, newcomers were rightfully asking, "what's the ‘right way' to write this tool?"

Some tools prioritized being self-contained and re-implemented stuff freely. Others made heavy use of libraries. All of them had copious amounts of argument parsing code.

I didn't feel comfortable telling anyone, especially less experienced folks, to use any of the existing code as a good model.

---

# Also… features are features!

The [Command Line Interface Guidelines (CLIG)](https://clig.dev/) has a list of features that good CLIs should provide, including built-in help and consistent flag and argument parsing.

These all dramatically improve the user experience using the tools, but adding these capabilities to each one individually was not code I could justify writing.

Instead, I sought to unify the disparate tools under a common infrastructure, so that each _could_ benefit from common features.

---

# oclif

We adopted oclif because it handled many of the CLIG's recommendations out of the box.

It also has a plugin model, which enables us to spread tools over multiple packages when/if it makes sense, but expose them under a common umbrella.

---

# But… a script is not a CLI app…

Some scripts, like run-bundle-analyses, have no arguments. Shouldn't those remain scripts?

No.

Even if they don't need arguments now, they probably will.

You get a bunch of user experience enhancements and automatic documentation by writing a command.

---

# Problems with current tools

- **Maintenance costs** – adding new commands and functionality differs between the tools
- **Unclear/inconsistent CLI** (quick: what is the difference between `bump --release` and `bump --releaseBump`?)
- **Unclear scope** – some tools work on the whole repo, some on individual release groups, some are for applying policy, some are used only in the release process, etc.

---

# Problems with current tools

- **Poor code hygiene** – very little linting, testing, and few doc strings and comments
- **Cruft** – some tools and flags are no longer needed, especially with the 2.0+ release process

---

# Fun questions

How many file system libraries are in use in build-tools, including `node:fs`?

How many implementations of `read`/`write` and `readAsync`/`writeAsync` exist in build-tools?

---

# Goals

* It should be easy to add a new CLI flag or even a new command
* It should be easy and obvious to re-use existing CLI flags for consistency
* Commands should follow a pattern to promote ease of use and to make it clear to new developers where to add new code
* Don't break existing CLI/tools
* Re-use as much existing build-tools code as possible (update function signatures and internal code where possible)

---

# Approach

* Move repo tools to a new release group with new CLI package to house them
* Add common infrastructure for linting and testing
* Export functions from build-tools as needed to implement new CLI
 * Eventually we should be able to remove unused code once the new CLI is complete
* Apply design principles to CLI

---

# Command pattern

`flub VERB [NOUN] --flags`

`flub release -g client`

`flub bump deps @fluidframework/build-common -t major -g azure`

`flub check policy --fix`

`flub check layers`

`flub info`

---

# flub release

Guides you through the release process

---

<!-- _class: lead -->

# Release process and the tools

---

# Terms

The release _driver_ is a human who's responsible for a release.

The release _process_ is the process that we define to deliver the release.

* It is driven by business goals.
* Non-developers care about it.
* It can change.

---

# Terms

The release _tools_ are intended to help the driver perform a release.

In other words, they exist to automate the release process.

Only release drivers (read: developers) care about them.

---

Process === Diagrams

Tools === Code

Wouldn't it be helpful if we could describe the process in an abstract way, and produce simpler, easier to understand
tools that "encodes" that process?

What if we could add steps to the process easily?

What if the tools knew about the _whole process_ – even the parts that aren't (yet) automated?

We can! With…

---

# Finite State Machines FTW!

The release process is a state machine written in [Finite State Language](https://fsl.tools/)

The machine definition is used in code using the [jssm](https://github.com/StoneCypher/jssm/) library

Generate diagrams using [jssm-viz](https://github.com/StoneCypher/jssm-viz) and jssm-viz-cli

---

# Using the state machine

TL; DR: the code is a big switch statement.

Loops over the state machine's current state until it reaches a terminal state.

Each state is handled by a handler function (just a case statement body).

Each handler signals _success_ or _failure_ , which triggers a state change in the machine, and the loop begins again.

Each handler has access to a context object containing metadata.

---

# Machine design decisions

## How many actions? (How many arrows exit a state?)
_2 for most states_

---

## How should duplicate or similar states be handled?

### _Option 1: Loop back to earlier states_

Requires more actions in most cases, because the path matters

### _Option 2: Create duplicate states that use the same handler_

Lots of duplicate states can be confusing
Naming convention helps: all states that should be handled the same are numbered

---

# Design lesson

It is tempting to add actions to encode logic branches…

  If a, then actionA, else if b, then actionB, else actionFail

…but it's better to add more states

Because:
 * State handlers don't need to know about what's next or what came before, so adding new states or rearranging states
   is easy.

---

# 8 months later… was the state machine worth it?

**In hindsight, the state machine was not necessary.**

The code could be rewritten as a bunch of functions that are called in the right order from an orchestrator function.

Need to re-order the steps or add new ones? Edit the orchestrator.

---

However, it is easier to update the state machine definition in my opinion than editing and reordering code. It's also less susceptible to regressions.

It also forced me to structure the code into functions that are all independent. A more experienced developer would likely do that instinctively, but the constraints helped me.

Finally, the diagram of the process helped me simplify the process overall by revealing that there's really a single release process, and a separate forking/convergence process. But that lesson hasn't made it back into the release tools.

---

<!-- _class: lead -->

# But…

I don't like that I need to explain/justify the design. That's a sign that it might not be the right choice.

---

# Testing challenges

The release process has a lot of inputs:

* The state of the repo (tags in particular).
* The current branch you're on.
* The type of release (major/minor).
* The merge state of branches.
* …

This is a lot to mock.

---

# Handling process changes

How to ensure new or changed states are handled in the tools?

Unit test checks that there's a handler for every state – but it's hacky.

---

# Repo maintenance tasks

| Task | Internal tools | External tools | Manual |
| :-: | :-: | :-: | :-: |
| Add new dependency | | `pnpm add` | |
| Update external dependencies | | `npm-check-updates` | |
| Check the version of packages in the repo | `flub info` | | |
| Update internal dependencies across the repo | `flub bump deps` | | |
| Do a release | `flub release` | | |
| Check and apply repo policy | `flub check policy` | | |
