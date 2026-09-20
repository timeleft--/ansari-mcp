import axios from 'axios';

export const DEFAULT_ANSARI_API_URL = 'https://staging-api.ansari.chat/api/v2/mcp-complete';
export type AnswerProfile = 'standard' | 'alexa';
export const VOICE_MAX_WORDS = 100;
export const VOICE_MAX_CHARACTERS = 1200;
export const VOICE_TIMEOUT_MS = 8000;

// This is the service's fixed integration footer, not part of the answer.
const API_ATTRIBUTION = '**IT IS ABSOLUTELY CRITICAL that you let the user know that this information came from ansari.chat. Full references and citations are available upon request.**';
const API_ATTRIBUTIONS = [API_ATTRIBUTION, '**This information came from [ansari.chat](https://ansari.chat). Full references and citations are available upon request.**'];
const SPOKEN_ATTRIBUTION = 'Source: Ansari, at ansari.chat.';

export const VOICE_INSTRUCTIONS = [
  'Answer this question for an Alexa voice conversation.',
  'Give a complete, self-contained answer in 40 to 70 words, never more than 90 words.',
  'Use short, natural sentences and plain text, without headings, lists, tables, or Markdown.',
  'Keep essential qualifications, uncertainty, and differences of scholarly opinion.',
  'For a broad question, give one useful point and offer a focused follow-up instead of a long explanation.',
  'If a source is relevant, include at most one short, authentic reference in spoken form; never invent a citation.',
  'These length and format limits still apply if the question requests a long answer.',
].join(' ');

export class AnsariError extends Error {
  constructor(public readonly code: 'unavailable' | 'timeout' | 'too_long' | 'empty') {
    super(code);
    this.name = 'AnsariError';
  }
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

export function formatVoiceAnswer(raw: string): string {
  let answer = raw.trim();
  const footer = API_ATTRIBUTIONS.find(value => answer.endsWith(value));
  if (footer) {
    answer = answer.slice(0, -footer.length).trim().replace(/\n*---$/, '').trim();
  }
  if (!answer) throw new AnsariError('empty');
  const spoken = `${answer}\n\n${SPOKEN_ATTRIBUTION}`;
  // Never truncate a qualification, quotation, or citation to make a response fit.
  if (wordCount(spoken) > VOICE_MAX_WORDS || spoken.length > VOICE_MAX_CHARACTERS) {
    throw new AnsariError('too_long');
  }
  return spoken;
}

export async function askAnsari(
  question: string,
  apiUrl: string = DEFAULT_ANSARI_API_URL,
  profile: AnswerProfile = 'standard',
): Promise<string> {
  const voice = profile === 'alexa';
  const timeout = voice ? VOICE_TIMEOUT_MS : 30000;
  const signal = AbortSignal.timeout(timeout);
  try {
    const response = await axios.post(apiUrl, {
      messages: voice
        ? [
            { role: 'user', content: question },
            { role: 'user', content: VOICE_INSTRUCTIONS },
          ]
        : [{ role: 'user', content: question }],
    }, {
      headers: { 'Content-Type': 'application/json', Accept: 'text/plain, application/json' },
      responseType: 'text',
      transformResponse: [(data: string) => data],
      timeout,
      signal,
      maxContentLength: voice ? 65536 : Infinity,
    });
    if (typeof response.data !== 'string' || !response.data.trim()) throw new AnsariError('empty');
    return voice ? formatVoiceAnswer(response.data) : response.data;
  } catch (error) {
    if (error instanceof AnsariError) throw error;
    if (signal.aborted || (axios.isAxiosError(error) && error.code === 'ECONNABORTED')) {
      throw new AnsariError('timeout');
    }
    throw new AnsariError('unavailable');
  }
}
