import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateWebsiteController } from "./controller/WebsiteController";
import { CreateInMemoryWebsiteRepository } from "./repository/InMemoryWebsiteRepository";
import { CreateWebsiteService } from "./service/WebsiteService";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";

export function createComposedApp(
  mode: "memory" | "prisma",
  logger?: ILoggingService,
): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  const repository = CreateInMemoryWebsiteRepository();

  const service = CreateWebsiteService(repository);
  const authUsers = CreateInMemoryUserRepository();
  const authService = CreateAuthService(authUsers);
  const authController = CreateAuthController(authService, resolvedLogger);
  const controller = CreateWebsiteController(service, resolvedLogger);
  return CreateApp(controller, authController, resolvedLogger);
}
