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
  const source = Ryan ?? Aleks;
  if (!source) {
    throw new Error("Consensus entry cannot be created without a source player.");
  }

  // A player earns a consensus slot from published grades alone. One grader is enough;
  // when both have graded, the consensus grade is the average of the two.
  const gradedBy = [publishedBoardGrade(Ryan), publishedBoardGrade(Aleks)];
  if (gradedBy.every((grade) => grade === null)) {
    return null;
  }
  const consensusGrade = averageOf(gradedBy, 0);

  const rankDiscrepency = typeof Ryan?.rank === "number" && typeof Aleks?.rank === "number"
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
        Ryan: Ryan ? { rank: Ryan.rank, posRank: Ryan.posRank } : undefined,
        Aleks: Aleks ? { rank: Aleks.rank, posRank: Aleks.posRank } : undefined,
      },
    },
    consensusGrade,
    averageRank: averageOf([Ryan?.rank, Aleks?.rank], Number.MAX_SAFE_INTEGER),
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
