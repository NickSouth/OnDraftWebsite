import { CreateInMemoryOnDraftRepository } from "../../src/repository/InMemoryOnDraftRepository";
import { CreateOnDraftService, type BigBoardEditableEntryInput } from "../../src/service/OnDraftService";
import type { BigBoard, BigBoardEntry } from "../../src/model/OnDraftContent";

function service() {
  return CreateOnDraftService(CreateInMemoryOnDraftRepository({ seedContent: false }));
}

function entryInput(overrides: BigBoardEditableEntryInput = {}): BigBoardEditableEntryInput {
  return {
    playerName: "Player",
    position: "QB",
    school: "OnDraft State",
    rank: 1,
    posRank: 1,
    height: { feet: 6, inches: 2 },
    weight: 215,
    ...overrides,
  };
}

function findEntry(board: BigBoard, playerName: string): BigBoardEntry {
  const entry = board.entries.find((candidate) => candidate.playerName === playerName);
  if (!entry) {
    throw new Error(`Expected entry for "${playerName}" on the board.`);
  }
  return entry;
}

describe("saveBigBoardEntries rank recompute", () => {
  it("compacts submitted ranks into a dense 1..N sequence", async () => {
    const ondraftService = service();
    await ondraftService.createBigBoardYear(2026);

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "Player A", rank: 5 }),
        entryInput({ playerName: "Player B", rank: 2 }),
        entryInput({ playerName: "Player C", rank: 9 }),
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    expect(findEntry(saved.value, "Player B").rank).toBe(1);
    expect(findEntry(saved.value, "Player A").rank).toBe(2);
    expect(findEntry(saved.value, "Player C").rank).toBe(3);
  });

  it("breaks duplicate submitted ranks by array position", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "Player A", rank: 1 }),
        entryInput({ playerName: "Player B", rank: 1 }),
        entryInput({ playerName: "Player C", rank: 2 }),
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    expect(findEntry(saved.value, "Player A").rank).toBe(1);
    expect(findEntry(saved.value, "Player B").rank).toBe(2);
    expect(findEntry(saved.value, "Player C").rank).toBe(3);
  });

  it("derives posRank from overall order per position, overriding submitted posRank", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "Quarterback One", position: "QB", rank: 1, posRank: 99 }),
        entryInput({ playerName: "Receiver One", position: "WR", rank: 2, posRank: 99 }),
        entryInput({ playerName: "Quarterback Two", position: "QB", rank: 3, posRank: 99 }),
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    expect(findEntry(saved.value, "Quarterback One").posRank).toBe(1);
    expect(findEntry(saved.value, "Receiver One").posRank).toBe(1);
    expect(findEntry(saved.value, "Quarterback Two").posRank).toBe(2);
  });

  it("leaves rankless entries unranked and does not let them consume an overall slot", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "Ranked One", rank: 4 }),
        entryInput({ playerName: "Draft Prospect", rank: null, posRank: 7 }),
        entryInput({ playerName: "Ranked Two", rank: 8, position: "WR" }),
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    expect(findEntry(saved.value, "Draft Prospect").rank).toBe(null);
    expect(findEntry(saved.value, "Draft Prospect").posRank).toBe(7);
    expect(findEntry(saved.value, "Ranked One").rank).toBe(1);
    expect(findEntry(saved.value, "Ranked Two").rank).toBe(2);
  });

  it("keeps the submitted posRank for a ranked entry without a position", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "Positionless Prospect", position: "", rank: 3, posRank: 5 }),
        entryInput({ playerName: "Quarterback One", position: "QB", rank: 1 }),
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    expect(findEntry(saved.value, "Positionless Prospect").rank).toBe(2);
    expect(findEntry(saved.value, "Positionless Prospect").posRank).toBe(5);
    expect(findEntry(saved.value, "Quarterback One").rank).toBe(1);
    expect(findEntry(saved.value, "Quarterback One").posRank).toBe(1);
  });

  it("accepts duplicate ranks on published entries because recompute runs before uniqueness validation", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "Quarterback One", rank: 1, posRank: 1, playerInfoPublished: true }),
        entryInput({ playerName: "Quarterback Two", rank: 1, posRank: 1, playerInfoPublished: true, weight: 225 }),
      ],
    });

    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    expect(findEntry(saved.value, "Quarterback One").rank).toBe(1);
    expect(findEntry(saved.value, "Quarterback One").posRank).toBe(1);
    expect(findEntry(saved.value, "Quarterback Two").rank).toBe(2);
    expect(findEntry(saved.value, "Quarterback Two").posRank).toBe(2);
  });

  it("does not recompute ranks on single-card saves", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "Player A", rank: 1 }),
        entryInput({ playerName: "Player B", rank: 2, position: "WR" }),
        entryInput({ playerName: "Player C", rank: 3, position: "RB" }),
      ],
    });
    expect(saved.ok).toBe(true);
    if (saved.ok === false) {
      return;
    }
    const target = findEntry(saved.value, "Player C");

    const singleSave = await ondraftService.saveBigBoardEntry({
      year: 2026,
      creator: "Ryan",
      entry: {
        ...entryInput({ playerName: "Player C", position: "RB", rank: 50, posRank: 9 }),
        id: target.id,
      },
    });

    expect(singleSave.ok).toBe(true);
    if (singleSave.ok === false) {
      return;
    }
    expect(singleSave.value.rank).toBe(50);
    expect(singleSave.value.posRank).toBe(9);
  });

  it("reflects recomputed ranks in the board returned by getBigBoard", async () => {
    const ondraftService = service();

    const saved = await ondraftService.saveBigBoardEntries({
      year: 2026,
      creator: "Ryan",
      entries: [
        entryInput({ playerName: "First Pick", rank: 1 }),
        entryInput({ playerName: "Second Pick", rank: 2, position: "WR" }),
        entryInput({ playerName: "Third Pick", rank: 3, position: "RB" }),
      ],
    });
    expect(saved.ok).toBe(true);

    const board = await ondraftService.getBigBoard(2026, "Ryan");
    expect(board.ok).toBe(true);
    if (board.ok === false) {
      return;
    }
    const ordered = [...board.value.entries].sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
    expect(ordered.map((entry) => entry.playerName)).toEqual(["First Pick", "Second Pick", "Third Pick"]);
    expect(ordered.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });
});
