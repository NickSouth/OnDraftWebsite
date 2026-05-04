export type AuthError =
  | { name: "InvalidCredentials"; message: string }
  | { name: "AuthenticationRequired"; message: string }
  | { name: "UserAlreadyExists"; message: string }
  | { name: "ValidationError"; message: string }
  | { name: "UnexpectedDependencyError"; message: string };

export const InvalidCredentials = (message: string): AuthError => ({
  name: "InvalidCredentials",
  message,
});

export const AuthenticationRequired = (message: string): AuthError => ({
  name: "AuthenticationRequired",
  message,
});

export const UserAlreadyExists = (message: string): AuthError => ({
  name: "UserAlreadyExists",
  message,
});

export const ValidationError = (message: string): AuthError => ({
  name: "ValidationError",
  message,
});

export const UnexpectedDependencyError = (message: string): AuthError => ({
  name: "UnexpectedDependencyError",
  message,
});
