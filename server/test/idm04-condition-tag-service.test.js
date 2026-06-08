import { describe, expect, test } from "vitest";

import {
  createConditionTagService,
  defaultConditionTags
} from "../src/idm04/conditionTagService.js";

describe("createConditionTagService", () => {
  test("exposes the default condition tags", () => {
    expect(defaultConditionTags).toEqual(["SALEABLE", "DEFECTIVE", "REPAIR"]);
  });

  test("uses the default tags when none are provided", () => {
    const service = createConditionTagService();
    expect(service.allowedTags).toBe(defaultConditionTags);
    expect(service.isAllowed("SALEABLE")).toBe(true);
    expect(service.isAllowed("DEFECTIVE")).toBe(true);
    expect(service.isAllowed("REPAIR")).toBe(true);
  });

  test("rejects tags outside the allowed set", () => {
    const service = createConditionTagService();
    expect(service.isAllowed("SCRAP")).toBe(false);
    expect(service.isAllowed("")).toBe(false);
    expect(service.isAllowed(undefined)).toBe(false);
  });

  test("is case-sensitive", () => {
    const service = createConditionTagService();
    expect(service.isAllowed("saleable")).toBe(false);
  });

  test("honours a custom allowed-tag list", () => {
    const service = createConditionTagService({ allowedTags: ["A", "B"] });
    expect(service.isAllowed("A")).toBe(true);
    expect(service.isAllowed("SALEABLE")).toBe(false);
  });
});
