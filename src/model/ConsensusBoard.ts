import { effectiveDraftBoardGrade } from "./DraftGrades";
import type { BigBoard, BigBoardEntry, ConsensusDiscrepancyWriteup } from "./OnDraftContent";

const CONSENSUS_RANK_DISCREPANCY_THRESHOLD = 10;

export type ConsensusBoardInput = {
  year: number;
  ryanEntries: BigBoardEntry[];
  aleksEntries: BigBoardEntry[];
  discrepancyWriteupFor: (playerName: string) => ConsensusDiscrepancyWriteup | undefined;
};

type ConsensusEntryDraft = {
  entry: BigBoardEntry;
  consensusGrade: number;
  averageRank: number;
};

function publishedBoardGrade(entry: BigBoardEntry | undefined): number | null {
  return entry?.gradePublished ? effectiveDraftBoardGrade(entry.grade) : null;
}

function averageOf(values: Array<number | null | undefined>, whenEmpty: number): number {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return numericValues.length === 0
    ? whenEmpty
    : numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function groupEntriesByPlayer(ryanEntries: BigBoardEntry[], aleksEntries: BigBoardEntry[]): Map<string, { Ryan?: BigBoardEntry; Aleks?: BigBoardEntry }> {
  const entriesByPlayer = new Map<string, { Ryan?: BigBoardEntry; Aleks?: BigBoardEntry }>();
  ryanEntries.filter((entry) => entry.playerInfoPublished).forEach((entry) => {
    entriesByPlayer.set(entry.playerName, { ...entriesByPlayer.get(entry.playerName), Ryan: entry });
  });
  aleksEntries.filter((entry) => entry.playerInfoPublished).forEach((entry) => {
    entriesByPlayer.set(entry.playerName, { ...entriesByPlayer.get(entry.playerName), Aleks: entry });
  });
  return entriesByPlayer;
}

function consensusEntryDraft(
  sources: { Ryan?: BigBoardEntry; Aleks?: BigBoardEntry },
  discrepancyWriteupFor: ConsensusBoardInput["discrepancyWriteupFor"],
): ConsensusEntryDraft | null {
  const { Ryan, Aleks } = sources;

  // A consensus needs both opinions: a player graded by only one of them is that grader's
  // take, not a consensus, so the board admits a player only once both grades are published.
  const ryanGrade = Ryan ? publishedBoardGrade(Ryan) : null;
  const aleksGrade = Aleks ? publishedBoardGrade(Aleks) : null;
  if (!Ryan || !Aleks || ryanGrade === null || aleksGrade === null) {
    return null;
  }
  const consensusGrade = (ryanGrade + aleksGrade) / 2;

  // Ryan's published player info is the source of truth for the shared card.
  const source = Ryan;
  const rankDiscrepency = typeof Ryan.rank === "number" && typeof Aleks.rank === "number"
    ? Math.abs(Ryan.rank - Aleks.rank)
    : 0;
  const isBigDiscrepency = rankDiscrepency > CONSENSUS_RANK_DISCREPANCY_THRESHOLD;

  return {
    entry: {
      ...source,
      id: `consensus-${source.id}`,
      rank: null,
      posRank: null,
      grade: null,
      writeup: { strengths: "", weaknesses: "", rundown: "" },
      writeupPublished: false,
      gradePublished: true,
      gradeSummary: { finalGrade: consensusGrade },
      bigDiscrepency: isBigDiscrepency,
      discWriteup: isBigDiscrepency
        ? discrepancyWriteupFor(source.playerName) ?? { ryanWriteup: "", aleksWriteup: "", published: false }
        : undefined,
      consensusRankingContext: {
        Ryan: { rank: Ryan.rank, posRank: Ryan.posRank },
        Aleks: { rank: Aleks.rank, posRank: Aleks.posRank },
      },
    },
    consensusGrade,
    averageRank: averageOf([Ryan.rank, Aleks.rank], Number.MAX_SAFE_INTEGER),
  };
}

// The consensus order is derived entirely from grades — the graders' own ranks only break ties
// between equal grades, where their manual ordering is a better signal than alphabetical.
function compareByGrade(first: ConsensusEntryDraft, second: ConsensusEntryDraft): number {
  return (
    second.consensusGrade - first.consensusGrade ||
    first.averageRank - second.averageRank ||
    first.entry.playerName.localeCompare(second.entry.playerName)
  );
}

export function buildConsensusBigBoard({ year, ryanEntries, aleksEntries, discrepancyWriteupFor }: ConsensusBoardInput): BigBoard {
  const drafts = [...groupEntriesByPlayer(ryanEntries, aleksEntries).values()]
    .map((sources) => consensusEntryDraft(sources, discrepancyWriteupFor))
    .filter((draft): draft is ConsensusEntryDraft => draft !== null)
    .sort(compareByGrade);

  const positionCounters = new Map<string, number>();
  drafts.forEach((draft, index) => {
    const nextPosRank = (positionCounters.get(draft.entry.position) ?? 0) + 1;
    positionCounters.set(draft.entry.position, nextPosRank);
    draft.entry.rank = index + 1;
    draft.entry.posRank = nextPosRank;
  });

  return { year, creator: "Consensus", entries: drafts.map((draft) => draft.entry) };
}
