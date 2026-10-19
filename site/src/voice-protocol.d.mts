export type OrchestraVoiceTool = {
  type: "function";
  name: "ask_robot_orchestra";
  description: string;
  parameters: {
    type: "object";
    properties: { task: { type: "string"; minLength: number; maxLength: number } };
    required: ["task"];
    additionalProperties: false;
  };
};

export function normalizeVoiceEndpoint(input: string): string;
export const ORCHESTRA_VOICE_TOOL: OrchestraVoiceTool;
export function createVoiceSessionUpdate(): Record<string, unknown>;
export function createTaskResponseRequest(): Record<string, unknown>;
export function createTaskFollowupResponseRequest(): Record<string, unknown>;
export function createFunctionOutput(callId: string, output: unknown): Record<string, unknown>;
export function pcm16Base64FromFloat32(samples: Float32Array, sourceRate: number, targetRate?: number): string;
export function float32FromPcm16Base64(encoded: string): Float32Array;
