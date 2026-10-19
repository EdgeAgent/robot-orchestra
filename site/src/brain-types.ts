export type BrainFeedItem = {
  id: string;
  kind: "task" | "plan" | "system" | "scan" | "artifact";
  title: string;
  body: string;
  createdAt: string;
};

export type BrainIdea = {
  id: string;
  title: string;
  body: string;
  status: "new" | "queued" | "dismissed" | "done";
  createdAt: string;
};

export type BrainGoal = {
  id: string;
  title: string;
  body: string;
  status: "active" | "paused" | "done";
  progress: number;
  proposedProgress?: number;
  proposedReason?: string;
  createdAt: string;
};

export type BrainArtifact = {
  id: string;
  name: string;
  body: string;
  url?: string;
  path?: string;
  createdAt: string;
};

export type BrainState = {
  version: 1;
  settings: {
    proactiveEnabled: boolean;
    intervalMinutes: 15 | 30 | 60;
    model: string;
  };
  nextMove: string;
  lastPulseAt: string | null;
  pulseStatus: "idle" | "thinking" | "error";
  feed: BrainFeedItem[];
  ideas: BrainIdea[];
  goals: BrainGoal[];
  artifacts: BrainArtifact[];
  updatedAt: string;
};

export const emptyBrainState: BrainState = {
  version: 1,
  settings: {
    proactiveEnabled: true,
    intervalMinutes: 30,
    model: "openrouter/free",
  },
  nextMove: "Set a goal or send a task to your selected model to start the planning feed.",
  lastPulseAt: null,
  pulseStatus: "idle",
  feed: [],
  ideas: [],
  goals: [],
  artifacts: [],
  updatedAt: new Date(0).toISOString(),
};
