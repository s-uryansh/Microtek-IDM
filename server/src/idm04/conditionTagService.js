export const defaultConditionTags = ["SALEABLE", "DEFECTIVE", "REPAIR"];

export function createConditionTagService({ allowedTags = defaultConditionTags } = {}) {
  const allowed = new Set(allowedTags);

  return {
    allowedTags,
    isAllowed(conditionTag) {
      return allowed.has(conditionTag);
    }
  };
}
