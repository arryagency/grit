import { WorkoutSession } from './storage';

const BASE_URL = 'http://192.168.1.105:3000';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function streamChat(
  messages: ChatMessage[],
  workoutHistory: WorkoutSession[],
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void
): Promise<void> {
  try {
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, workoutHistory }),
    });

    if (!response.ok) {
      onError(`Server error: ${response.status}`);
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'delta') onChunk(data.text);
          if (data.type === 'done') {
            onDone();
            return;
          }
          if (data.type === 'error') {
            onError(data.message);
            return;
          }
        } catch {
          // skip malformed lines
        }
      }
    }
    onDone();
  } catch (err: any) {
    onError(err.message ?? 'Connection failed. Is the backend running?');
  }
}

export interface ParsedLogEntry {
  exerciseName: string;
  weight: number;
  reps: number;
  sets: number;
}

/** Ask the backend Claude to parse free-form workout text. Returns null on any failure. */
export async function parseLogWithClaude(text: string): Promise<ParsedLogEntry[] | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/parse-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data.results) && data.results.length > 0 ? data.results : null;
  } catch {
    return null;
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}
