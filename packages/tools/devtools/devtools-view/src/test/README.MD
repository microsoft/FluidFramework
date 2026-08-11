## Accessibility Testing Guidelines

### Overview
Accessibility testing ensures that our components are usable by people with a wide range of abilities and disabilities. This section provides guidance on how to read, write, and run accessibility tests for the components in this library.


#### Tools and Extensions
We use a combination of automated tools and manual checks to validate accessibility:

- Accessibility Insights for Web: This Chrome extension helps developers find and fix accessibility issues in web apps. It provides a fast way to detect issues and verify that the components are accessible.
- Jest and React Testing Library: Our accessibility tests are designed and automated using the axe-core library, which helps identify common accessibility issues.
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
    expect(someElement).toHaveFocus();
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
