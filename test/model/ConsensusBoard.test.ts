import { buildConsensusBigBoard } from "../../src/model/ConsensusBoard";
import type { DraftGrade } from "../../src/model/DraftGrades";
import type { BigBoardEntry, Position } from "../../src/model/OnDraftContent";

// The consensus board only reads the effective board grade, so an override alone pins it exactly
// and keeps these cases independent of the trait math.
function gradeOf(boardGrade: number): DraftGrade {
  return {
    position: "QB",
    archetype: "Balanced",
    potential: null,
    physicalTraits: {},
    filmTraits: {},
    overrideDisplayGrade: boardGrade,
  };
}

type EntryOverrides = {
  playerName?: string;
  position?: Position;
  rank?: number | null;
  boardGrade?: number;
  gradePublished?: boolean;
  playerInfoPublished?: boolean;
};

function entry(overrides: EntryOverrides = {}): BigBoardEntry {
  const boardGrade = overrides.boardGrade;
  return {
    id: `${overrides.playerName ?? "Player"}-${overrides.rank ?? 0}`,
    playerName: overrides.playerName ?? "Player",
    position: overrides.position ?? "QB",
    school: "OnDraft State",
    rank: overrides.rank ?? 1,
    posRank: 1,
    height: { feet: 6, inches: 2 },
    weight: 215,
    playerInfoPublished: overrides.playerInfoPublished ?? true,
    grade: boardGrade === undefined ? null : gradeOf(boardGrade),
    gradePublished: overrides.gradePublished ?? boardGrade !== undefined,
    writeup: { strengths: "", weaknesses: "", rundown: "" },
    writeupPublished: false,
    notes: "",
  };
}

function build(ryanEntries: BigBoardEntry[], aleksEntries: BigBoardEntry[] = []) {
  return buildConsensusBigBoard({
    year: 2026,
    ryanEntries,
    aleksEntries,
    discrepancyWriteupFor: () => undefined,
  });
}

describe("buildConsensusBigBoard grade admission", () => {
  it("uses the single grader's grade when only Ryan has graded the player", () => {
    const board = build(
      [entry({ playerName: "Solo Ryan", boardGrade: 6.5 })],
      [entry({ playerName: "Solo Ryan" })],
    );

    expect(board.entries).toHaveLength(1);
    expect(board.entries[0].gradeSummary?.finalGrade).toBe(6.5);
  });

  it("uses the single grader's grade when only Aleks has graded the player", () => {
    const board = build(
      [entry({ playerName: "Solo Aleks" })],
      [entry({ playerName: "Solo Aleks", boardGrade: 5.25 })],
    );

    expect(board.entries).toHaveLength(1);
    expect(board.entries[0].gradeSummary?.finalGrade).toBe(5.25);
  });

  it("averages both grades when Ryan and Aleks have each graded the player", () => {
    const board = build(
      [entry({ playerName: "Both Graded", boardGrade: 7 })],
      [entry({ playerName: "Both Graded", boardGrade: 6 })],
    );

    expect(board.entries).toHaveLength(1);
    expect(board.entries[0].gradeSummary?.finalGrade).toBe(6.5);
  });

  it("leaves a player off the board when neither grader has graded them", () => {
    const board = build(
      [entry({ playerName: "Ungraded" })],
      [entry({ playerName: "Ungraded" })],
    );

    expect(board.entries).toEqual([]);
  });

  it("ignores an entered but unpublished grade", () => {
    const board = build(
      [entry({ playerName: "Draft Grade", boardGrade: 8, gradePublished: false })],
      [entry({ playerName: "Draft Grade", boardGrade: 4 })],
    );

    expect(board.entries).toHaveLength(1);
    expect(board.entries[0].gradeSummary?.finalGrade).toBe(4);
  });

  it("leaves a player off the board when their only grade is unpublished", () => {
    const board = build([entry({ playerName: "Draft Only", boardGrade: 8, gradePublished: false })]);

    expect(board.entries).toEqual([]);
  });

  it("leaves out graded players whose player info is unpublished", () => {
    const board = build([entry({ playerName: "Hidden", boardGrade: 7, playerInfoPublished: false })]);

    expect(board.entries).toEqual([]);
  });
});

describe("buildConsensusBigBoard ordering", () => {
  it("orders by consensus grade regardless of the graders' own rankings", () => {
    const board = build([
      entry({ playerName: "Low Grade High Rank", rank: 1, boardGrade: 4 }),
      entry({ playerName: "High Grade Low Rank", rank: 40, boardGrade: 7.5 }),
      entry({ playerName: "Middle", rank: 20, boardGrade: 6 }),
    ]);

    expect(board.entries.map((consensusEntry) => [consensusEntry.playerName, consensusEntry.rank])).toEqual([
      ["High Grade Low Rank", 1],
      ["Middle", 2],
      ["Low Grade High Rank", 3],
    ]);
  });

  it("derives position ranks from the grade order", () => {
    const board = build([
      entry({ playerName: "Second Quarterback", position: "QB", rank: 1, boardGrade: 5 }),
      entry({ playerName: "First Quarterback", position: "QB", rank: 2, boardGrade: 7 }),
      entry({ playerName: "Only Receiver", position: "WR", rank: 3, boardGrade: 6 }),
    ]);

    expect(board.entries.map((consensusEntry) => [consensusEntry.playerName, consensusEntry.rank, consensusEntry.posRank])).toEqual([
      ["First Quarterback", 1, 1],
      ["Only Receiver", 2, 1],
      ["Second Quarterback", 3, 2],
    ]);
  });

  it("breaks equal grades on the graders' average rank before falling back to the player name", () => {
    const board = build([
      entry({ playerName: "Alphabetically First", rank: 30, boardGrade: 6 }),
      entry({ playerName: "Better Ranked", rank: 2, boardGrade: 6 }),
    ]);

    expect(board.entries.map((consensusEntry) => consensusEntry.playerName)).toEqual([
      "Better Ranked",
      "Alphabetically First",
    ]);
  });

  it("falls back to the player name when grade and average rank both tie", () => {
    const board = build([
      entry({ playerName: "Bravo", rank: 5, boardGrade: 6 }),
      entry({ playerName: "Alpha", rank: 5, boardGrade: 6 }),
    ]);

    expect(board.entries.map((consensusEntry) => consensusEntry.playerName)).toEqual(["Alpha", "Bravo"]);
  });
});
