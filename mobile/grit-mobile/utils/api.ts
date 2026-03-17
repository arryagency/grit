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

export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}
