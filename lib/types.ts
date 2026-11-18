export type Depth = "summary" | "detailed" | "";

export interface Bullet {
  id: string;
  text: string;
  tags: string[];
  depth: Depth | string;
  emphasis: string;
  job: string;
  excludes: string[];
  active: boolean;
}

export type VariantType = "Tagline" | "Summary" | "Skills";

export interface Variant {
  id: string;
  type: VariantType;
  text: string;
  notes: string;
  active: boolean;
}

export interface Job {
  name: string;
  /** Text that appears in the employer line above this job's placeholder in the template. */
  employer: string;
  min: number;
  max: number;
}

export interface Recipe {
  name: string;
  /** Part name ("Tagline", "Summary", "Skills", or a job name) -> ordered IDs. */
  parts: Record<string, string[]>;
  notes: string;
}

export interface Bank {
  bullets: Bullet[];
  variants: Variant[];
  jobs: Job[];
  recipes: Recipe[];
  rules: string[];
}

export interface Pick {
  id: string;
  reason: string;
}

export interface Requirement {
  requirement: string;
  covered_by: string[];
  strength: "strong" | "partial" | "none";
}

export interface Selection {
  tagline: Pick | null;
  summary: Pick | null;
  skills: Pick[];
  /** Job name -> ordered bullet picks. */
  jobs: Record<string, Pick[]>;
}

export interface MatchReport {
  requirements: Requirement[];
  gaps: string[];
  notes: string;
  /** Job name -> what the first bullets are meant to establish. */
  ordering?: Record<string, string>;
}

export interface SelectResult {
  selection: Selection;
  report: MatchReport;
  /** Problems the app found in Claude's picks and fixed or could not fix. */
  warnings: string[];
}
