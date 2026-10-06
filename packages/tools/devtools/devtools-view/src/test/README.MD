## Accessibility Testing Guidelines

### Overview
Accessibility testing ensures that our components are usable by people with a wide range of abilities and disabilities. This section provides guidance on how to read, write, and run accessibility tests for the components in this library.


#### Tools and Extensions
We use a combination of automated tools and manual checks to validate accessibility:

- Accessibility Insights for Web: This Chrome extension helps developers find and fix accessibility issues in web apps. It provides a fast way to detect issues and verify that the components are accessible.
- Mocha and React Testing Library: Our accessibility tests use the axe-core library to identify common accessibility issues.
### Running Accessibility Tests
To run the accessibility tests locally, follow these steps:

##### Install Dependencies:
Install and build the code by running the following the instructions [here](../../README.md).



##### Run Tests:

Navigate to the relevant package directory and run all the unit and accessibility tests using:

```bash
pnpm run test
```

### Reading Accessibility Tests

Accessibility tests are structured similarly to regular unit tests, with an added focus on verifying that components meet accessibility standards. Here's an overview of how these tests are organized:

Test cases are written using describe and it blocks, where we render the component, run the accessibility check, and assert that there are no violations.

```typescript
describe("ComponentName Accessibility Check", () => {
    it("ComponentName is accessible", async () => {
        const { container } = render(<ComponentName />);
        await assertNoAccessibilityViolations(container);
    });
});
```

Keyboard Navigation: Specific tests check if users can navigate through the components using keyboard interactions like tab and arrow keys.

```typescript
it("Can tab/arrow navigate through the ComponentName", async () => {
    render(<ComponentName />);
    const user = userEvent.setup();
    await user.tab();
    // Add assertions for navigation
    const someElement = screen.getByRole("button", { name: /Button Name/ });
    assert.equal(document.activeElement, someElement);
});
```

### Using Accessibility Insights for Web

Since our extension is also available in line in the Devtools example app, we can manually verify the accessibility of components using the Accessibility Insights for Web browser extension.
This tool provides a comprehensive set of tests to identify and fix accessibility issues.

- Install the Extension: Download and install the Accessibility Insights for Web add-on from the Edge Web Store.

- Run FastPass:
Use the FastPass feature to quickly identify common accessibility issues in your components.
FastPass scans for issues like color contrast, missing ARIA labels, and more.

- Detailed Assessment:
For a more thorough check, run the Assessment tool in Accessibility Insights for Web.
This tool provides step-by-step guidance to test all aspects of accessibility.

- Fix Issues:
Based on the results from Accessibility Insights for Web, make the necessary changes to your components to ensure they are fully accessible.

### Verify Telemetry Context with a Screen Reader

The menu tests check that the Events button belongs to a group with the accessible name "Telemetry".
They also check unique header IDs and keyboard focus order.
These tests do not verify spoken output.

1. Build and load the [local browser extension](../../../devtools-browser-extension/README.md#local-extension-testing).
2. Open an application with Fluid Devtools and telemetry support.
3. Start a screen reader, such as Narrator or NVDA.
4. Open the browser developer tools and select Fluid Devtools.
5. Use Tab to move from a container control to the Events button.
6. Confirm that the announcement includes the Telemetry context and identifies Events as a button.
7. Move to the next control, then use Shift+Tab to return to Events.
8. Confirm that the announcement includes the Telemetry context on re-entry.
9. Press Enter or Space to open the telemetry events view.

The exact words and their order depend on the screen reader and its settings.
The Telemetry label and group must not add stops to the Tab sequence.
An accessibility tester must verify spoken output before the accessibility bug closes.
