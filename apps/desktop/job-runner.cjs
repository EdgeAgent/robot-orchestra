"use strict";
/**
 * Robot Orchestra — free-model tool-loop guard, v1.
 *
 * Free models are weakest at long, multi-step tool loops. This guard
 * keeps jobs narrow, retries once, then escalates to Kevin instead of
 * looping forever, burning tokens, or hallucinating a result.
 *
 * Rules:
 *  - Narrow first: a job is one agent, one task, one output. If a job
 *    contains two different verbs (research + build + send), split it
 *    before it runs — the guard returns the split, it does not run the blob.
 *  - One retry only: on failure, retry once with a narrowed job
 *    (first clause only, capped at 200 chars). No second retry.
 *  - Escalate, never fake: after the retry fails, return escalated:true
 *    with the exact error and the narrowed job that failed. The head
 *    speaks that to Kevin and stops. No invented success, no silent skip.
 *  - Approval gate still applies: this guard never approves a risky job.
 */
function narrowJob(job) {
  const text = String(job || "").trim();
  // First sentence / first clause is the narrow job.
  const first = text.split(/[.;\n]/)[0].trim();
  return first.slice(0, 200);
}
function splitJob(job) {
  const text = String(job || "").trim();
  const parts = text.split(/\band then\b|\bthen\b|;/i).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [text];
}
function isMultiJob(job) {
  return splitJob(job).length > 1;
}
async function runJobWithGuard(jobFn, job, options) {
  const opts = options || {};
  const maxRetries = opts.maxRetries === undefined ? 1 : opts.maxRetries;
  let currentJob = String(job || "");
  let attempts = 0;
  let lastError = null;
  while (attempts <= maxRetries) {
    attempts += 1;
    try {
      const result = await jobFn(currentJob, attempts);
      return { ok: true, attempts, result, job: currentJob };
    } catch (error) {
      lastError = error;
      if (attempts > maxRetries) break;
      currentJob = narrowJob(currentJob);
    }
  }
  return {
    ok: false,
    escalated: true,
    attempts,
    job: currentJob,
    error: lastError ? String(lastError.message || lastError) : "Job failed.",
    message: `Escalating to Kevin: job failed after ${attempts} attempt(s), narrowed to "${currentJob}". Error: ${lastError ? String(lastError.message || lastError) : "unknown"}`,
  };
}

module.exports = { narrowJob, splitJob, isMultiJob, runJobWithGuard };
