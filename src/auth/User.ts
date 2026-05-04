export interface IUserRecord {
  id: string;
  email: string;
  displayName: string;
  password: string;
}

export interface IAuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export function toAuthenticatedUser(user: IUserRecord): IAuthenticatedUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}
