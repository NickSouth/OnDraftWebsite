import type { IWebsiteRepository } from "../repository/WebsiteRepository";

export interface IWebsiteService {}

class WebsiteService implements IWebsiteService {
  constructor(private readonly repository: IWebsiteRepository) {}
}

export function CreateWebsiteService(repository: IWebsiteRepository): IWebsiteService {
  return new WebsiteService(repository);
}
