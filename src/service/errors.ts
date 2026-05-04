export type WebsiteError =
  | { name: "ValidationError"; message: string }
  | { name: "UnexpectedDependencyError"; message: string };

export const ValidationError = (message: string): WebsiteError => ({
  name: "ValidationError",
  message,
});

export const UnexpectedDependencyError = (message: string): WebsiteError => ({
  name: "UnexpectedDependencyError",
  message,
});
