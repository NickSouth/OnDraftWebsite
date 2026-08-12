import {
  abbreviateDraftGradeTrait,
  calculateDraftGrade,
  draftGradePositionConfig,
  type DraftGrade,
  type DraftGradeTraitScore,
} from "../../src/model/DraftGrades";
import { DRAFT_GRADE_FORMULAS } from "../../src/model/DraftGradeFormulas.generated";
import type { Position } from "../../src/model/OnDraftContent";

const UNIVERSAL_PHYSICAL_ABBREVIATIONS: Record<string, string> = {
  Speed: "SPD",
  Acceleration: "ACC",
  Agility: "AGI",
  "Change of Direction": "COD",
  Strength: "STR",
  "Size / Frame": "FRA",
};

// Expected film-trait codes per app position, from the "Trait Abbreviations"
// sheet of 2027 Scouting Hub Template v2.0.xlsx.
const EXPECTED_FILM_ABBREVIATIONS: Record<Position, Record<string, string>> = {
  QB: {
    "Arm Talent": "ARM",
    "Mechanics / Footwork": "MEC",
    "Quick Accuracy": "QAC",
    "Intermediate Accuracy": "IAC",
    "Deep Accuracy": "DAC",
    "Off Platform Accuracy": "OPA",
    "Ball Placement": "BPL",
    "Pre-Snap Processing": "PSP",
    Processing: "PRS",
    Anticipation: "ANT",
    "Play Extension": "PEX",
    "Decision Making": "DEC",
    "Pressure Awareness": "PRA",
    "Pocket Feel": "PKF",
  },
  RB: {
    Vision: "VIS",
    Creativity: "CRE",
    Tempo: "TEM",
    Power: "POW",
    "Contact Balance": "BAL",
    Elusiveness: "ELU",
    "Ball Security": "BSC",
    Hands: "CTH",
    "Route Running": "RR",
    "Pass Blocking": "PBK",
  },
  WR: {
    "Blocking / Toughness": "BLK",
    "Route Tree": "RTR",
    "Short Route Running": "SRR",
    "Intermediate Route Running": "IRR",
    "Deep Route Running": "DRR",
    Release: "RLS",
    Catching: "CTH",
    "Catch In Traffic": "CIT",
    "Contested Catching": "CTT",
    "Body Control": "BCL",
    "Run After Catch": "RAC",
  },
  TE: {
    Catching: "CTH",
    "Catch In Traffic": "CIT",
    "Contested Catching": "CTT",
    "Body Control": "BCL",
    "Route Running": "RR",
    "Spatial Awareness": "SPA",
    "Run After Catch": "RAC",
    "Run Block Technique": "RBT",
    "Run Block Effort": "RBE",
    "Pass Blocking": "PBK",
  },
  OT: {
    Range: "RNG",
    Hands: "HAN",
    Footwork: "FTW",
    Anchor: "ANC",
    "Get Off": "GET",
    Striking: "STK",
    Drive: "DRV",
    Sustain: "SUS",
    Balance: "BAL",
    "Football IQ": "IQ",
  },
  IOL: {
    Hands: "HAN",
    Footwork: "FTW",
    Anchor: "ANC",
    "Get Off": "GET",
    Striking: "STK",
    Drive: "DRV",
    Sustain: "SUS",
    Balance: "BAL",
    "Football IQ": "IQ",
  },
  IDL: {
    "Get Off": "GET",
    Power: "POW",
    Finesse: "FIN",
    "Pass Rush Plan": "PRP",
    "Block Shed": "SHD",
    "Pad Level": "PDL",
    Anchor: "ANC",
    "Discipline & Diagnostics": "DD",
    Tackling: "TKL",
    Pursuit: "PUR",
  },
  EDGE: {
    "Get Off": "GET",
    Bend: "BND",
    Power: "POW",
    Finesse: "FIN",
    "Pass Rush Plan": "PRP",
    "Block Shed": "SHD",
    "Pad Level": "PDL",
    Anchor: "ANC",
    "Discipline & Diagnostics": "DD",
    Tackling: "TKL",
    Pursuit: "PUR",
    Coverage: "COV",
  },
  LB: {
    Tackling: "TKL",
    Pursuit: "PUR",
    "Block Shed": "SHD",
    "Block Take-On": "BTO",
    "Block Avoidance": "BAV",
    Diagnostics: "DIA",
    Discipline: "DIS",
    Range: "RNG",
    "Man Coverage": "MCV",
    "Zone Coverage": "ZCV",
    "Play Action": "PAC",
    Blitzing: "BTZ",
  },
  CB: {
    "Man Coverage": "MCV",
    "Intermediate Zone Coverage": "IZC",
    "Deep Zone Coverage": "DZC",
    "Jam Press": "JPR",
    "Bail Press": "BPR",
    "Click and Close": "CC",
    "Ball Skills": "BSK",
    "Run Recognition": "RRC",
    Tackling: "TKL",
    "Block Shedding": "SHD",
    Discipline: "DIS",
  },
  S: {
    "Man Coverage": "MCV",
    "Intermediate Zone Coverage": "IZC",
    "Deep Zone Coverage": "DZC",
    "Click and Close": "CC",
    "Ball Skills": "BSK",
    "Run Recognition": "RRC",
    "Block Take-On": "BTO",
    Tackling: "TKL",
    Pursuit: "PUR",
    "Block Shedding": "SHD",
    Discipline: "DIS",
  },
};

const APP_POSITIONS = Object.keys(EXPECTED_FILM_ABBREVIATIONS) as Position[];

function expectedAbbreviation(position: Position, trait: string): string | undefined {
  return UNIVERSAL_PHYSICAL_ABBREVIATIONS[trait] ?? EXPECTED_FILM_ABBREVIATIONS[position][trait];
}

function traitsForPosition(position: Position): string[] {
  const config = draftGradePositionConfig(position);
  expect(config).not.toBeNull();
  const traits = new Set<string>();
  for (const archetype of config!.archetypes) {
    for (const category of archetype.categories) {
      for (const trait of category.traits) {
        traits.add(trait);
      }
    }
  }
  return [...traits];
}

describe("draft grade trait abbreviations (FS-3)", () => {
  it.each(APP_POSITIONS)("matches the spreadsheet codes for every %s formula trait", (position) => {
    const config = draftGradePositionConfig(position);
    expect(config).not.toBeNull();
    expect(config!.archetypes.length).toBeGreaterThan(0);

    for (const archetype of config!.archetypes) {
      for (const category of archetype.categories) {
        for (const trait of category.traits) {
          const expected = expectedAbbreviation(position, trait);
          // Every formula-derived trait must have an explicit sheet code (no auto-initial fallback).
          expect(expected).toBeDefined();
          expect(abbreviateDraftGradeTrait(trait, position)).toBe(expected);
        }
      }
    }
  });

  it.each(APP_POSITIONS)("has no duplicate codes within %s", (position) => {
    const traits = traitsForPosition(position);
    const codes = traits.map((trait) => abbreviateDraftGradeTrait(trait, position));
    expect(new Set(codes).size).toBe(traits.length);
  });

  it("abbreviates Hands as CTH for RB and HAN elsewhere", () => {
    expect(abbreviateDraftGradeTrait("Hands", "RB")).toBe("CTH");
    expect(abbreviateDraftGradeTrait("Hands", "OT")).toBe("HAN");
    expect(abbreviateDraftGradeTrait("Hands", "IOL")).toBe("HAN");
    expect(abbreviateDraftGradeTrait("Hands")).toBe("HAN");
  });

  it("keeps the auto-initial fallback for unknown traits", () => {
    expect(abbreviateDraftGradeTrait("Some Unknown Trait")).toBe("SUT");
  });
});

describe("QB grade formula weights (FS-8)", () => {
  const qbArchetypes = DRAFT_GRADE_FORMULAS.QB.Archetypes;

  it("applies the revised Balanced split", () => {
    expect(qbArchetypes["Balanced"]["Physical Weight"]).toBe(0.31);
    expect(qbArchetypes["Balanced"]["Film Weight"]).toBe(0.69);
  });

  it("applies the revised Dual Threat split and film weights", () => {
    const dualThreat = qbArchetypes["Dual Threat"];
    expect(dualThreat["Physical Weight"]).toBe(0.38);
    expect(dualThreat["Film Weight"]).toBe(0.62);
    expect(dualThreat["Film Traits"]["Arm Talent"]).toBe(0.08);
    expect(dualThreat["Film Traits"]["Off Platform Accuracy"]).toBe(0.06);
    expect(dualThreat["Film Traits"]["Pre-Snap Processing"]).toBe(0.08);
    expect(dualThreat["Film Traits"]["Processing"]).toBe(0.08);
    expect(dualThreat["Film Traits"]["Anticipation"]).toBe(0.08);
    expect(dualThreat["Film Traits"]["Play Extension"]).toBe(0.09);
    expect(dualThreat["Film Traits"]["Decision Making"]).toBe(0.08);
    expect(dualThreat["Film Traits"]["Pocket Feel"]).toBe(0.09);
  });

  it("applies the revised Project split and film weights", () => {
    const project = qbArchetypes["Project"];
    expect(project["Physical Weight"]).toBe(0.4);
    expect(project["Film Weight"]).toBe(0.6);
    expect(project["Film Traits"]["Arm Talent"]).toBe(0.1);
    expect(project["Film Traits"]["Ball Placement"]).toBe(0.05);
    expect(project["Film Traits"]["Pre-Snap Processing"]).toBe(0.08);
    expect(project["Film Traits"]["Play Extension"]).toBe(0.09);
    expect(project["Film Traits"]["Decision Making"]).toBe(0.07);
    expect(project["Film Traits"]["Pressure Awareness"]).toBe(0.09);
    expect(project["Film Traits"]["Pocket Feel"]).toBe(0.09);
  });

  it("leaves Field General unchanged", () => {
    expect(qbArchetypes["Field General"]["Physical Weight"]).toBe(0.27);
    expect(qbArchetypes["Field General"]["Film Weight"]).toBe(0.73);
  });

  it.each(Object.keys(qbArchetypes))("keeps %s weights normalized", (name) => {
    const archetype = qbArchetypes[name as keyof typeof qbArchetypes];
    const physicalsSum = Object.values(archetype.Physicals).reduce((sum: number, weight) => sum + Number(weight), 0);
    const filmSum = Object.values(archetype["Film Traits"]).reduce((sum: number, weight) => sum + Number(weight), 0);
    expect(physicalsSum).toBeCloseTo(1, 10);
    expect(filmSum).toBeCloseTo(1, 10);
    expect(archetype["Physical Weight"] + archetype["Film Weight"]).toBeCloseTo(1, 10);
  });
});

describe("QB grade calculation with revised weights (FS-8)", () => {
  const QB_PHYSICAL_TRAITS = ["Speed", "Acceleration", "Agility", "Change of Direction", "Strength", "Size / Frame"];
  const QB_FILM_TRAITS = [
    "Arm Talent",
    "Mechanics / Footwork",
    "Quick Accuracy",
    "Intermediate Accuracy",
    "Deep Accuracy",
    "Off Platform Accuracy",
    "Ball Placement",
    "Pre-Snap Processing",
    "Processing",
    "Anticipation",
    "Play Extension",
    "Decision Making",
    "Pressure Awareness",
    "Pocket Feel",
  ];

  function uniformTraits(traits: string[], score: number): Record<string, DraftGradeTraitScore> {
    return Object.fromEntries(traits.map((trait) => [trait, score]));
  }

  // Heterogeneous fixtures so trait-level weight changes affect the result.
  const P: Record<string, DraftGradeTraitScore> = {
    Speed: 8,
    Acceleration: 7,
    Agility: 6,
    "Change of Direction": 5,
    Strength: 4,
    "Size / Frame": 3,
  };
  const F: Record<string, DraftGradeTraitScore> = {
    "Arm Talent": 8,
    "Mechanics / Footwork": 7,
    "Quick Accuracy": 6,
    "Intermediate Accuracy": 5,
    "Deep Accuracy": 4,
    "Off Platform Accuracy": 3,
    "Ball Placement": 2,
    "Pre-Snap Processing": 1,
    Processing: 8,
    Anticipation: 7,
    "Play Extension": 6,
    "Decision Making": 5,
    "Pressure Awareness": 4,
    "Pocket Feel": 3,
  };

  function qbGrade(archetype: string, potential: number, physicalTraits: Record<string, DraftGradeTraitScore>, filmTraits: Record<string, DraftGradeTraitScore>): DraftGrade {
    return { position: "QB", archetype, potential, physicalTraits, filmTraits };
  }

  it("computes the Balanced archetype with the new split", () => {
    const calculation = calculateDraftGrade(
      qbGrade("Balanced", 4, uniformTraits(QB_PHYSICAL_TRAITS, 8), uniformTraits(QB_FILM_TRAITS, 2)),
    );
    // 8*0.31 + 2*0.69 = 3.86; + potential 0.06; + 1.0 QB board bump = 4.92 (was 5.10 with the old 0.34/0.66 split).
    expect(calculation).not.toBeNull();
    expect(calculation!.displayGrade).toBeCloseTo(4.92, 3);
  });

  it("computes the Dual Threat archetype with the new weights", () => {
    const calculation = calculateDraftGrade(qbGrade("Dual Threat", 6, P, F));
    // Old-weight displayGrade was 6.3214.
    expect(calculation).not.toBeNull();
    expect(calculation!.physicalGrade).toBeCloseTo(5.56, 3);
    expect(calculation!.filmGrade).toBeCloseTo(4.96, 3);
    expect(calculation!.displayGrade).toBeCloseTo(6.338, 3);
  });

  it("computes the Project archetype with the new weights", () => {
    const calculation = calculateDraftGrade(qbGrade("Project", 6, P, F));
    // Only the category split moved this time (0.43/0.57 -> 0.40/0.60), so the trait
    // composites are untouched and the board grade shifts by 0.03 * (film - physical).
    expect(calculation).not.toBeNull();
    expect(calculation!.physicalGrade).toBeCloseTo(5.56, 3);
    expect(calculation!.filmGrade).toBeCloseTo(5.03, 3);
    expect(calculation!.displayGrade).toBeCloseTo(6.392, 3);
  });

  it("keeps Field General grades stable (unchanged archetype)", () => {
    const calculation = calculateDraftGrade(
      qbGrade("Field General", 5, uniformTraits(QB_PHYSICAL_TRAITS, 6), uniformTraits(QB_FILM_TRAITS, 7)),
    );
    // 6*0.27 + 7*0.73 = 6.73; + potential 0.1; + 1.0 QB board bump = 7.83 — identical before and after FS-8.
    expect(calculation).not.toBeNull();
    expect(calculation!.displayGrade).toBeCloseTo(7.83, 3);
  });
});
