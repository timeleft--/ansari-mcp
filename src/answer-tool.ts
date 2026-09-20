import { z } from 'zod';
import { askAnsari, AnsariError, DEFAULT_ANSARI_API_URL, wordCount, type AnswerProfile } from './ansari-service.js';

export function answerTool(profile: AnswerProfile, apiUrl = DEFAULT_ANSARI_API_URL) {
  const voice = profile === 'alexa';
  return {
    name: 'answer_islamic_question',
    description: voice
      ? 'Ask Ansari for a short answer about Islam for Alexa to speak aloud. Returns a complete answer of at most 100 words with attribution. Pass one self-contained question including context from any follow-up. Long explanations are not supported by this voice endpoint. If the tool fails, explain the failure; do not substitute an answer attributed to Ansari.'
      : 'Answer questions about Islamic theology, history, and practice based on authentic sources.',
    annotations: { title: voice ? 'Ask Ansari for a short spoken answer' : 'Answer Islamic Question', readOnlyHint: true, openWorldHint: true },
    parameters: z.object({
      question: (voice ? z.string().trim().min(1).max(4000) : z.string().min(1))
        .describe('The question about Islam, including context needed to answer it on its own.'),
    }).strict(),
    async execute({ question }: { question: string }) {
      const start = Date.now();
      let outcome = 'unavailable';
      let words = 0;
      try {
        const text = await askAnsari(question, apiUrl, profile);
        outcome = 'success';
        words = wordCount(text);
        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        const code = error instanceof AnsariError ? error.code : 'unavailable';
        outcome = code;
        const text = code === 'too_long'
          ? 'Ansari returned an answer that is too long for voice. Please ask a narrower question. No answer has been shortened or read out.'
          : code === 'timeout'
            ? 'Ansari did not finish in time. Please try again or ask a simpler question.'
            : 'Ansari is unavailable right now. Please try again later.';
        return { isError: true, content: [{ type: 'text' as const, text }] };
      } finally {
        if (process.env.ANSARI_LOG_METRICS === '1') {
          console.error(JSON.stringify({ event: 'ansari_answer', profile, outcome, words, durationMs: Date.now() - start, completedAt: new Date().toISOString() }));
        }
      }
    },
  };
}
