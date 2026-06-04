import type { Locator, Page } from "playwright";
import type { LocatorSpec } from "../dsl/index.js";

export function resolveLocator(page: Page, locator: LocatorSpec): Locator {
  switch (locator.strategy) {
    case "role":
      return page.getByRole(locator.role, { name: locator.name });
    case "label":
      return page.getByLabel(locator.name, { exact: true });
    case "placeholder":
      return page.getByPlaceholder(locator.text);
    case "text":
      return page.getByText(locator.text);
    case "testid":
      return page.getByTestId(locator.id);
    case "css":
      return page.locator(locator.selector);
    default: {
      const _exhaustive: never = locator;
      throw new Error(`Unknown locator strategy: ${(_exhaustive as LocatorSpec).strategy}`);
    }
  }
}

export function describeLocator(locator: LocatorSpec): string {
  switch (locator.strategy) {
    case "role":
      return `${locator.role} "${locator.name}"`;
    case "label":
      return `field "${locator.name}"`;
    case "placeholder":
      return `placeholder "${locator.text}"`;
    case "text":
      return `text "${locator.text}"`;
    case "testid":
      return `testid:${locator.id}`;
    case "css":
      return `css:${locator.selector}`;
  }
}
