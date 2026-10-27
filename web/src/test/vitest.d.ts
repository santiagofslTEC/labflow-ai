import "vitest";
import type { AxeMatchers } from "vitest-axe/matchers";

// vitest-axe still types its matcher on the old `Vi` namespace; this exposes it on vitest 5.
// The type parameter must match vitest's own declaration, even though it is unused here.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Assertion<T = unknown> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
