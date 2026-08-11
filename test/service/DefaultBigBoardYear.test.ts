import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";
import { CreateOnDraftService, DEFAULT_BIG_BOARD_YEAR_SETTING_KEY } from "../../src/service/OnDraftService";

function service() {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository({ seedContent: false }));
}

describe("default big board year", () => {
  it("resolveDefaultBigBoardYear falls back to the current calendar year when unset", async () => {
    const ondraftService = service();

    const resolved = await ondraftService.resolveDefaultBigBoardYear();

    expect(resolved).toBe(new Date().getFullYear());
  });

  it("setDefaultBigBoardYear persists and resolveDefaultBigBoardYear returns it", async () => {
    const ondraftService = service();

    const set = await ondraftService.setDefaultBigBoardYear(2027);
    expect(set.ok).toBe(true);
    if (set.ok === true) {
      expect(set.value).toBe(2027);
    }

    const resolved = await ondraftService.resolveDefaultBigBoardYear();
    expect(resolved).toBe(2027);
  });

  it("setDefaultBigBoardYear rejects invalid years", async () => {
    const ondraftService = service();

    const tooSmall = await ondraftService.setDefaultBigBoardYear(99);
    expect(tooSmall.ok).toBe(false);
    if (tooSmall.ok === false) {
      expect(tooSmall.value.name).toBe("BigBoardValidationError");
    }

    const tooLarge = await ondraftService.setDefaultBigBoardYear(5000);
    expect(tooLarge.ok).toBe(false);
    if (tooLarge.ok === false) {
      expect(tooLarge.value.name).toBe("BigBoardValidationError");
    }
  });

  it("resolveDefaultBigBoardYear falls back when the stored value is not a valid year", async () => {
    const repository = CreateInMemoryOnDraftRepository({ seedContent: false });
    await repository.setAppSetting(DEFAULT_BIG_BOARD_YEAR_SETTING_KEY, "not-a-year");
    const ondraftService = CreateOnDraftService(repository);

    const resolved = await ondraftService.resolveDefaultBigBoardYear();

    expect(resolved).toBe(new Date().getFullYear());
  });

  it("repository app settings roundtrip returns null when unset and the value once set", async () => {
    const repository = CreateInMemoryOnDraftRepository({ seedContent: false });

    const unset = await repository.getAppSetting("someKey");
    expect(unset.ok).toBe(true);
    if (unset.ok === true) {
      expect(unset.value).toBe(null);
    }

    const saved = await repository.setAppSetting("someKey", "someValue");
    expect(saved.ok).toBe(true);

    const fetched = await repository.getAppSetting("someKey");
    expect(fetched.ok).toBe(true);
    if (fetched.ok === true) {
      expect(fetched.value).toBe("someValue");
    }
  });

  it("deleteBigBoardYear clears a matching stored default", async () => {
    const ondraftService = service();

    await ondraftService.createBigBoardYear(2027);
    const set = await ondraftService.setDefaultBigBoardYear(2027);
    expect(set.ok).toBe(true);

    const deleted = await ondraftService.deleteBigBoardYear(2027);
    expect(deleted.ok).toBe(true);

    const resolved = await ondraftService.resolveDefaultBigBoardYear();
    expect(resolved).toBe(new Date().getFullYear());
  });
});
