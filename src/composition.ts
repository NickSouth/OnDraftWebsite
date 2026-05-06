import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreateApp } from "./app";
import type { IApp } from "./contracts";
import { CreateOnDraftController } from "./controller/OnDraftController";
import { CreateInMemoryOnDraftRepository } from "./repository/InMemoryOnDraftRepository";
import { CreateOnDraftService } from "./service/OnDraftService";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";

export function createComposedApp(
  mode: "memory" | "prisma",
  logger?: ILoggingService,
): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  const repository = CreateInMemoryOnDraftRepository();

  const service = CreateOnDraftService(repository);
  const authUsers = CreateInMemoryUserRepository();
  const authService = CreateAuthService(authUsers);
  const authController = CreateAuthController(authService, resolvedLogger);
  const controller = CreateOnDraftController(service, resolvedLogger);
  return CreateApp(controller, authController, resolvedLogger);
}
