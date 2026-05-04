import type { IWebsiteRepository } from "./WebsiteRepository";

class InMemoryWebsiteRepository implements IWebsiteRepository {}

export function CreateInMemoryWebsiteRepository(): IWebsiteRepository {
  return new InMemoryWebsiteRepository();
}
