import { AcpClient } from './AcpClient';

export interface WorkerResult {
  sessionId: string;
  acp: AcpClient;
}

/**
 * Spawns a new kiro-cli acp process as a headless worker session.
 * Returns the session ID and ACP client once ready. The process stays alive until terminated.
 */
export async function spawnWorkerSession(prompt: string, model?: string, agent: string = 'amzn-builder'): Promise<WorkerResult> {
  const acp = new AcpClient(model, agent);

  acp.spawn();
  await acp.initialize();
  const sessionId = await acp.newSession();

  // Set the model explicitly after session creation
  if (model) {
    await acp.setModel(sessionId, model).catch(() => {/* ignore if not supported */});
    // Give kiro a moment to persist the model to the session JSON
    await new Promise(r => setTimeout(r, 1500));
  }

  if (prompt.trim()) {
    // Fire-and-forget — don't await, let the agent run
    acp.prompt(prompt).catch(e => console.error('[WorkerSession] prompt error:', e));
  }

  // Keep the process alive — it will persist until terminated via SIGTERM on its PID
  acp.on('exit', (code: number) => {
    console.log(`[WorkerSession] Session ${sessionId.slice(0, 8)} exited (${code})`);
  });

  console.log(`[WorkerSession] Started session ${sessionId.slice(0, 8)}${prompt ? `: "${prompt.slice(0, 60)}"` : ''}`);
  return { sessionId, acp };
}
