# Screenshot Skill TDD Testing

## Test Scenario: User requests screenshot analysis

**Goal**: Test if agent can correctly handle screenshot capture and loading WITHOUT the skill.

### Pressure Scenario (Baseline - RED Phase)

**User request**: "I need you to take a screenshot of my screen and analyze what you see. I'm having a UI bug I want you to help debug."

**Expected challenges**:

1. Does agent know which screenshot tool to use?
2. Does agent detect platform correctly?
3. Does agent know to use Read tool to load the image?
4. Does agent handle missing screenshot tools gracefully?
5. Does agent save to appropriate temporary location?

### Test Execution Log

#### Baseline Test #1 (without skill)

Date: 2025-10-14
Agent type: general-purpose subagent
Result: FAILED - Did not attempt screenshot capture

**Observed behavior**:

- Agent stated it "does not have the ability to take screenshots"
- Did not consider using Bash tool with screenshot commands
- Correctly identified it could read images with Read tool if user provides path
- Suggested user manually take screenshot

**Rationalizations used**:

- "I do not have the ability to take screenshots of your screen"
- "no screenshot or screen capture tool available" (in tools inventory)

**What worked**:

- Knew Read tool can analyze images
- Offered helpful alternatives

**What failed**:

- Did not recognize Bash tool could execute screenshot commands
- Did not attempt platform detection
- Did not try to find available screenshot tools

**Key insight**: Agent needs explicit instruction that Bash + screenshot CLI tools = screenshot capability

---

#### With Skill Test (GREEN phase)

Date: 2025-10-14
Agent type: general-purpose subagent
Result: SUCCESS - Full compliance with skill instructions

**Observed behavior**:

- Agent read the skill as instructed
- Correctly detected platform (Linux via `uname -s`)
- Properly checked for available tools in priority order
- Gracefully handled missing tools case
- Provided installation instructions as skill specifies
- Offered alternative (manual screenshot + file path)

**Compliance level**: 100%

- Followed all steps in correct order
- Used exact commands from skill
- Handled edge case (no tools) correctly
- No rationalizations or shortcuts

**Verification**: Skill successfully addresses baseline failure. Agent now knows:

1. It CAN take screenshots via Bash + CLI tools
2. How to detect platform
3. Which tools to check for
4. How to handle missing tools

---

## Refinement Iterations

### Analysis for Potential Loopholes

**Reviewed areas**:

1. ✅ Platform detection - covers macOS and Linux
2. ✅ Tool detection - checks multiple tools in priority order
3. ✅ Missing tools - provides installation instructions
4. ✅ File paths - uses absolute paths with /tmp/
5. ✅ Read tool usage - explicitly instructs to load image
6. ✅ Common mistakes section - addresses key failure modes

**Potential edge cases to consider**:

- ❓ What if user is on Windows? (Not in current scope - macOS/Linux only per requirements)
- ❓ What if /tmp/ is not writable? (Rare, reasonable assumption)
- ❓ What if user cancels interactive selection? (Acceptable - user choice)
- ❓ What about fullscreen vs area selection? (Skill shows interactive, which is flexible)

**Decision**: No critical loopholes found. Skill is appropriately scoped for macOS/Linux environments where /tmp/ is standard and screenshot tools exist or can be installed.

### Final Assessment

**Skill quality**: Production-ready

- Clear, actionable instructions
- Handles happy path and error cases
- Provides concrete examples
- Follows CSO best practices (searchable keywords, rich when_to_use)
- Token-efficient (~150 lines, appropriate for frequent loading)
