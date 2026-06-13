import type { Position } from "./OnDraftContent";
import { DRAFT_GRADE_FORMULAS } from "./DraftGradeFormulas.generated";

export type DraftGradeTraitScore = number | "NA" | null;
export type DraftGradePotentialScore = number | "NA" | null;

export type DraftGrade = {
  position: Position;
  archetype: string;
  value?: string;
  potential: DraftGradePotentialScore;
  physicalTraits: Record<string, DraftGradeTraitScore>;
  filmTraits: Record<string, DraftGradeTraitScore>;
  overrideDisplayGrade?: number | null;
};

export type DraftGradeCategory = {
  key: "physicalTraits" | "filmTraits";
  label: "Physicals" | "Film Traits";
  traits: string[];
};

export type DraftGradeArchetypeOption = {
  name: string;
  categories: DraftGradeCategory[];
};

export type DraftGradePositionConfig = {
  position: Position;
  archetypes: DraftGradeArchetypeOption[];
};

export type DraftGradeCalculation = {
  physicalGrade: number;
  filmGrade: number;
  rawGrade: number;
  finalGrade: number;
  boardGrade: number;
  displayGrade: number;
};

export type DraftGradeSummary = {
  finalGrade: number;
};

const DRAFT_GRADE_OVERRIDE_EPSILON = 0.025;

type FormulaPosition = "QB" | "RB" | "WR" | "TE" | "OT" | "IOL" | "IDL" | "ED" | "LB" | "CB" | "S";
type FormulaArchetypeData = {
  "Physical Weight"?: number;
  "Film Weight"?: number;
  Physicals: FormulaTraits;
  "Film Traits": FormulaTraits;
};
type FormulaPositionData = {
  "Physical Weight"?: number;
  "Film Weight"?: number;
  Archetypes: Record<string, FormulaArchetypeData>;
};
type FormulaTraits = Record<string, number>;

const FORMULAS = DRAFT_GRADE_FORMULAS as unknown as Record<FormulaPosition, FormulaPositionData> & {
  Potential: Record<string, number>;
};

const FORMULA_POSITION_BY_APP_POSITION: Record<Position, FormulaPosition> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  OT: "OT",
  IOL: "IOL",
  EDGE: "ED",
  IDL: "IDL",
  LB: "LB",
  CB: "CB",
  S: "S",
};

export const DRAFT_GRADE_TRAIT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

const DRAFT_GRADE_TRAIT_ABBREVIATIONS: Record<string, string> = {
  Speed: "SPD",
  Acceleration: "ACC",
  Agility: "AGI",
  "Change of Direction": "COD",
  Strength: "STR",
  "Size / Frame": "FRA",
  "Arm Talent": "ARM",
  "Mechanics / Footwork": "MEC",
  "Quick Accuracy": "QAC",
  "Intermediate Accuracy": "IAC",
  "Deep Accuracy": "DAC",
  "Off Platform Accuracy": "OPA",
  "Ball Placement": "BPL",
  "Pre-Snap Processing": "PRE",
  Processing: "PRO",
  Anticipation: "ANT",
  "Play Extension": "PEX",
  "Decision Making": "DEC",
  "Pressure Awareness": "PRS",
  "Pocket Feel": "PKT",
  "Contact Balance": "BAL",
  Vision: "VIS",
  "Footwork / Tempo": "TMP",
  "Pad Level": "PAD",
  "Receiving Skills": "REC",
  "Pass Protection": "PP",
  "Ball Security": "SEC",
  "Explosiveness": "EXP",
  "Blocking / Toughness": "BLK",
  "Route Tree": "RT",
  "Short Route Running": "SRR",
  "Intermediate Route Running": "IRR",
  "Deep Route Running": "DRR",
  Release: "REL",
  Catching: "CAT",
  "Catch In Traffic": "CIT",
  "Contested Catching": "CON",
  "Body Control": "BDY",
  "Run After Catch": "RAC",
  "Inline Blocking": "IBK",
  "Space Blocking": "SBK",
  "Anchor / Balance": "ANC",
  "Hand Usage": "HND",
  "Pass Set": "PST",
  "Mirror Ability": "MIR",
  "Recovery Ability": "RCV",
  "Second Level Blocking": "2LV",
  "Pulling / Movement": "PUL",
  "Combo Blocks": "CMB",
  "Reach Blocks": "RCH",
  "Awareness": "AWR",
  "Get Off": "GO",
  Bend: "BND",
  Power: "PWR",
  Finesse: "FIN",
  "Pass Rush Plan": "PRP",
  "Block Shed": "SHD",
  Anchor: "ANC",
  "Discipline & Diagnostics": "DSC",
  Tackling: "TAK",
  Pursuit: "PUR",
  Coverage: "COV",
  "Gap Discipline": "GAP",
  "Run Defense": "RDF",
  "Pass Rush": "PRS",
  "Stack & Shed": "STS",
  "Zone Coverage": "ZON",
  "Man Coverage": "MAN",
  "Blitzing": "BLZ",
  Range: "RNG",
  "Ball Skills": "BAL",
  "Press Technique": "PRS",
  "Off Coverage": "OFF",
  "Route Recognition": "REC",
  "Click and Close": "CLK",
  "Run Support": "RUN",
  "Hip Fluidity": "HIP",
  "Eye Discipline": "EYE",
  "Open Field Tackling": "OFT",
  "Deep Zone Coverage": "DZC",
  "Intermediate Zone Coverage": "IZC",
  "Run Recognition": "RR",
  "Block Take-On": "BTO",
  "Block Shedding": "BSH",
  Discipline: "DIS",
};

function formulaPositionFor(position: Position | ""): FormulaPosition | null {
  return position ? FORMULA_POSITION_BY_APP_POSITION[position] ?? null : null;
}

function positionData(position: Position | ""): FormulaPositionData | null {
  const formulaPosition = formulaPositionFor(position);
  return formulaPosition ? FORMULAS[formulaPosition] : null;
}

function archetypeData(position: Position | "", archetype: string): FormulaArchetypeData | null {
  const data = positionData(position);
  if (!data || !(archetype in data.Archetypes)) {
    return null;
  }
  return data.Archetypes[archetype];
}

function traitsFromFormula(traits: FormulaArchetypeData["Physicals"] | FormulaArchetypeData["Film Traits"]): string[] {
  return Object.keys(traits);
}

export function abbreviateDraftGradeTrait(trait: string): string {
  const known = DRAFT_GRADE_TRAIT_ABBREVIATIONS[trait];
  if (known) {
    return known;
  }
  const words = trait
    .replace(/&/g, " ")
    .replace(/\//g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const abbreviation = words.map((word) => word[0]?.toUpperCase() ?? "").join("").slice(0, 4);
  return abbreviation || trait.slice(0, 4).toUpperCase();
}

export function draftGradePositionConfig(position: Position | ""): DraftGradePositionConfig | null {
  const data = positionData(position);
  if (!data || !position) {
    return null;
  }

  return {
    position,
    archetypes: Object.entries(data.Archetypes).map(([name, archetype]) => ({
      name,
      categories: [
        {
          key: "physicalTraits",
          label: "Physicals",
          traits: traitsFromFormula(archetype.Physicals),
        },
        {
          key: "filmTraits",
          label: "Film Traits",
          traits: traitsFromFormula(archetype["Film Traits"]),
        },
      ],
    })),
  };
}

export function draftGradeArchetypeNames(position: Position | ""): string[] {
  return draftGradePositionConfig(position)?.archetypes.map((archetype) => archetype.name) ?? [];
}

export function defaultDraftGrade(position: Position | ""): DraftGrade | null {
  const config = draftGradePositionConfig(position);
  const firstArchetype = config?.archetypes[0];
  if (!config || !firstArchetype) {
    return null;
  }

  return {
    position: config.position,
    archetype: firstArchetype.name,
    potential: null,
    physicalTraits: Object.fromEntries(firstArchetype.categories[0].traits.map((trait) => [trait, null])),
    filmTraits: Object.fromEntries(firstArchetype.categories[1].traits.map((trait) => [trait, null])),
  };
}

export function isDraftGradeTraitScore(value: unknown): value is DraftGradeTraitScore {
  return value === null || value === "NA" || isDraftGradeNumericScore(value);
}

export function isDraftGradeNumericScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 8;
}

export function isDraftGradePotentialScore(value: unknown): value is number {
  return isDraftGradeNumericScore(value) && Number.isInteger(value);
}

export function normalizeDraftGradeTraitScore(value: unknown): DraftGradeTraitScore {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string" && value.trim().toUpperCase() === "NA") {
    return "NA";
  }
  const normalized = typeof value === "number" ? value : Number(value);
  return isDraftGradeNumericScore(normalized) ? normalized : null;
}

export function normalizePotential(value: unknown): DraftGradePotentialScore {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "string" && value.trim().toUpperCase() === "NA") {
    return "NA";
  }
  const normalized = typeof value === "number" ? value : Number(value);
  return isDraftGradePotentialScore(normalized) ? normalized : null;
}

export function normalizeDraftGradeOverride(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalized = typeof value === "number" ? value : Number(value);
  return Number.isFinite(normalized) && normalized >= 1 && normalized <= 8
    ? Math.round(normalized * 100) / 100
    : null;
}

export function normalizeDraftGradeValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTraitMap(value: unknown): Record<string, DraftGradeTraitScore> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).map(([trait, score]) => [trait, normalizeDraftGradeTraitScore(score)]));
}

export function toDraftGrade(value: unknown, fallbackPosition: Position | "" = ""): DraftGrade | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const input = value as Record<string, unknown>;
  const rawPosition = typeof input.position === "string"
    ? input.position
    : typeof input.Position === "string"
      ? input.Position
      : fallbackPosition;
  const position = formulaPositionFor(rawPosition as Position | "") ? rawPosition as Position : fallbackPosition;
  if (!position || !formulaPositionFor(position)) {
    return null;
  }

  const archetypes = draftGradeArchetypeNames(position);
  const rawArchetype = typeof input.archetype === "string"
    ? input.archetype
    : typeof input.Archetype === "string"
      ? input.Archetype
      : "";
  const archetype = archetypes.includes(rawArchetype)
    ? rawArchetype
    : archetypes[0] ?? "";
  if (!archetype) {
    return null;
  }

  const rawPhysicalTraits = input.physicalTraits ?? input.Physicals;
  const rawFilmTraits = input.filmTraits ?? input["Film Traits"];

  return {
    position,
    archetype,
    value: normalizeDraftGradeValue(input.value ?? input.Value),
    potential: normalizePotential(input.potential ?? input.Potential),
    physicalTraits: normalizeTraitMap(rawPhysicalTraits),
    filmTraits: normalizeTraitMap(rawFilmTraits),
    overrideDisplayGrade: normalizeDraftGradeOverride(input.overrideDisplayGrade ?? input.OverrideDisplayGrade),
  };
}

function categoryWeight(position: Position, archetype: FormulaArchetypeData, category: "Physical" | "Film"): number {
  if (position === "QB") {
    return category === "Physical"
      ? Number(archetype["Physical Weight"])
      : Number(archetype["Film Weight"]);
  }

  const data = positionData(position);
  if (!data) {
    return 0;
  }
  return category === "Physical"
    ? Number((data as { "Physical Weight"?: number })["Physical Weight"])
    : Number((data as { "Film Weight"?: number })["Film Weight"]);
}

function weightedTraitScore(input: Record<string, DraftGradeTraitScore>, weights: FormulaTraits): number {
  let score = 0;
  let weightUsed = 0;
  for (const [trait, weight] of Object.entries(weights)) {
    const traitScore = input[trait];
    if (traitScore === "NA" || traitScore === null || traitScore === undefined) {
      continue;
    }
    score += traitScore * weight;
    weightUsed += weight;
  }
  return weightUsed > 0 ? score / weightUsed : 0;
}

export function calculateDraftGrade(grade: DraftGrade | null): DraftGradeCalculation | null {
  if (!grade || !isDraftGradePotentialScore(grade.potential)) {
    return null;
  }

  const archetype = archetypeData(grade.position, grade.archetype);
  if (!archetype) {
    return null;
  }

  const physicalGrade = weightedTraitScore(grade.physicalTraits, archetype.Physicals as FormulaTraits);
  const filmGrade = weightedTraitScore(grade.filmTraits, archetype["Film Traits"] as FormulaTraits);
  const rawGrade = physicalGrade * categoryWeight(grade.position, archetype, "Physical")
    + filmGrade * categoryWeight(grade.position, archetype, "Film");
  const potentialFactor = FORMULAS.Potential[String(grade.potential)] ?? 0;
  const finalGrade = rawGrade + potentialFactor;
  const boardGrade = finalGrade + (grade.position === "QB" ? 1 : 0.7);
  const displayGrade = Math.min(boardGrade, 8);

  return {
    physicalGrade,
    filmGrade,
    rawGrade,
    finalGrade,
    boardGrade,
    displayGrade,
  };
}

export function draftGradeBoardScore(grade: DraftGrade | null): number | null {
  return effectiveDraftBoardGrade(grade);
}

export function effectiveDraftBoardGrade(grade: DraftGrade | null): number | null {
  const calculatedGrade = calculateDraftGrade(grade)?.displayGrade ?? null;
  const override = normalizeDraftGradeOverride(grade?.overrideDisplayGrade);
  return override !== null && (calculatedGrade === null || Math.abs(override - calculatedGrade) >= DRAFT_GRADE_OVERRIDE_EPSILON)
    ? override
    : calculatedGrade;
}

export function formatDraftBoardGrade(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}/8` : "-/8";
}

export function gradeTraitCategoriesForGrade(grade: DraftGrade | null, fallbackPosition: Position | ""): DraftGradeCategory[] {
  const position = grade?.position || fallbackPosition;
  const config = draftGradePositionConfig(position);
  if (!config) {
    return [];
  }

  const selectedArchetype = config.archetypes.find((archetype) => archetype.name === grade?.archetype) ?? config.archetypes[0];
  return selectedArchetype?.categories ?? [];
}

export function validateDraftGradeForPublication(position: Position | "", grade: DraftGrade | null): string[] {
  const issues: string[] = [];
  if (!position) {
    issues.push("Choose a valid position before publishing a grade.");
    return issues;
  }
  if (!grade) {
    issues.push("Add grade details before publishing a grade.");
    return issues;
  }
  if (grade.position !== position) {
    issues.push("The grade position must match the player position.");
  }
  if (!archetypeData(position, grade.archetype)) {
    issues.push("Choose a valid archetype before publishing a grade.");
  }
  if (!isDraftGradePotentialScore(grade.potential)) {
    issues.push("Potential must be a whole number from 1 to 8 before publishing a grade.");
  }

  for (const category of gradeTraitCategoriesForGrade(grade, position)) {
    const scores = category.key === "physicalTraits" ? grade.physicalTraits : grade.filmTraits;
    for (const trait of category.traits) {
      if (scores[trait] !== "NA" && !isDraftGradeNumericScore(scores[trait])) {
        issues.push(`${trait} must be a number from 1 to 8 or NA before publishing a grade.`);
      }
    }
  }

  return issues;
}
