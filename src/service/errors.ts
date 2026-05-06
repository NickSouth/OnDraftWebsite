export type OnDraftError =
  | { name: "ValidationError"; message: string }
  | { name: "UnexpectedDependencyError"; message: string };

export const ValidationError = (message: string): OnDraftError => ({
  name: "ValidationError",
  message,
});

export const UnexpectedDependencyError = (message: string): OnDraftError => ({
  name: "UnexpectedDependencyError",
  message,
});
