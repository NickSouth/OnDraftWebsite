import { CreateAuthService } from "../../src/auth/AuthService";
import { CreateInMemoryUserRepository } from "../../src/auth/InMemoryUserRepository";

describe("AuthService", () => {
  it("authenticates a known demo user", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const result = await service.authenticate({
      email: "alice@website.test",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.displayName).toBe("Alice Website");
    }
  });

  it("rejects bad credentials without revealing which field was wrong", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const result = await service.authenticate({
      email: "alice@website.test",
      password: "wrong-password",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.value.name).toBe("InvalidCredentials");
      expect(result.value.message).toBe("Invalid email or password.");
    }
  });

  it("validates email and password presence before checking the repository", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const missingEmail = await service.authenticate({
      email: "",
      password: "password123",
    });
    const missingPassword = await service.authenticate({
      email: "alice@website.test",
      password: "   ",
    });

    expect(missingEmail.ok).toBe(false);
    expect(missingPassword.ok).toBe(false);
    if (!missingEmail.ok) {
      expect(missingEmail.value.message).toBe("Email is required.");
    }
    if (!missingPassword.ok) {
      expect(missingPassword.value.message).toBe("Password is required.");
    }
  });

  it("registers a new user", async () => {
    const service = CreateAuthService(CreateInMemoryUserRepository());

    const result = await service.register({
      displayName: "Draft Analyst",
      email: "draft@website.test",
      password: "password123",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe("draft@website.test");
      expect(result.value.displayName).toBe("Draft Analyst");
    }
  });
});
