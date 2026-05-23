import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePrismaUserRepository } from "./auth/PrismaUserRepository";
import { CreateApp } from "./app";
import { loadAppConfig, type IAppConfig } from "./config/AppConfig";
import type { IApp } from "./contracts";
import { CreateOnDraftController } from "./controller/OnDraftController";
import { CreateEmailService } from "./email/EmailService";
import { CreateInMemoryOnDraftRepository } from "./repository/InMemoryOnDraftRepository";
import { CreatePrismaOnDraftRepository } from "./repository/PrismaOnDraftRepository";
import { CreateOnDraftService } from "./service/OnDraftService";
import { CreateUserPreferenceService } from "./service/UserPreferenceService";
import { CreateYoutubeVideoStatsService } from "./service/YoutubeVideoStatsService";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { getPrismaClient } from "./prisma/client";
import { CreatePrismaSessionStore } from "./session/PrismaSessionStore";

export function createComposedApp(
  mode: "memory" | "prisma",
  logger?: ILoggingService,
  config: IAppConfig = loadAppConfig(),
): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  const prisma = mode === "prisma" ? getPrismaClient() : null;
  const repository = prisma ? CreatePrismaOnDraftRepository(prisma) : CreateInMemoryOnDraftRepository();
  const emailService = CreateEmailService(config.email, resolvedLogger);

  const youtubeStats = CreateYoutubeVideoStatsService();
  const service = CreateOnDraftService(repository, youtubeStats);
  const authUsers = prisma ? CreatePrismaUserRepository(prisma) : CreateInMemoryUserRepository();
  const userPreferences = CreateUserPreferenceService(authUsers);
  const authService = CreateAuthService(authUsers, emailService, config.email);
  const authController = CreateAuthController(authService, resolvedLogger);
  const controller = CreateOnDraftController(service, userPreferences, resolvedLogger, authService);
  return CreateApp(
    controller,
    authController,
    resolvedLogger,
    prisma ? CreatePrismaSessionStore(prisma) : undefined,
  );
}
