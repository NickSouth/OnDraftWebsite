import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";

describe("InMemoryOnDraftRepository", () => {
  const originalLoadTestFlag = process.env.ONDRAFT_MEMORY_LOAD_TEST;

  afterEach(() => {
    if (originalLoadTestFlag === undefined) {
      delete process.env.ONDRAFT_MEMORY_LOAD_TEST;
      return;
    }
    process.env.ONDRAFT_MEMORY_LOAD_TEST = originalLoadTestFlag;
  });

  it("can hard-code 50 load-test entries into the local memory draft boards", async () => {
    process.env.ONDRAFT_MEMORY_LOAD_TEST = "true";
    const repository = CreateInMemoryOnDraftRepository();
    const year = new Date().getFullYear();

    const ryan = await repository.getBigBoard(year, "Ryan");
    const aleks = await repository.getBigBoard(year, "Aleks");
    const consensus = await repository.getBigBoard(year, "Consensus");

    expect(ryan.ok && ryan.value.entries).toHaveLength(50);
    expect(aleks.ok && aleks.value.entries).toHaveLength(50);
    expect(consensus.ok && consensus.value.entries).toHaveLength(50);
  });
});
