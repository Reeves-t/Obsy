// Prompts for the Unpack (guided reflection) edge function.
// Two steps: (a) generate exactly 3 clarifying questions, (b) generate a
// reviewable first-person reflection draft. Calm, observant, non-therapy tone.

import { buildProfileContextSection } from "../_shared/ai/profileContext.ts";

export type UnpackEntryType = "text" | "photo" | "voice" | "link";

export interface UnpackContextInput {
  type: UnpackEntryType;
  text?: string;
  transcript?: string;
  imageContext?: string;
  linkSummary?: string;
  linkTitle?: string;
  source?: string;
}

export interface UnpackMoodInput {
  id?: string;
  name: string;
}

export interface UnpackAnswerInput {
  question: string;
  answer: string;
  skipped: boolean;
}

export const SYSTEM_PROMPT =
  `You are Obsy's Unpack assistant. Your job is to help the user turn a quick moment, thought, media capture, voice note, or shared link into a clearer journal-style entry.

Obsy is not a therapy app.
Do not diagnose.
Do not use clinical language.
Do not overanalyze.
Do not tell the user what they feel as certainty.
Do not make the tone dramatic.
Do not sound like self-help content.
Do not use dashes of any kind (em dash, en dash, or hyphens as punctuation). Use commas or periods instead.

Your tone should be: calm, observant, minimal, human, reflective, grounded, aesthetic, emotionally intelligent but not therapy-like.

The goal is to help the user understand what stood out, why it may matter, and what they may want to remember.

Always treat the selected mood as useful context, not as a final judgment.

Return JSON only. No markdown fences, no commentary, no text outside the JSON object.`;

// ── Context assembly ───────────────────────────────────────────────────────

function buildEntryContextLines(context: UnpackContextInput, mood: UnpackMoodInput): string[] {
  const lines: string[] = [
    "ENTRY CONTEXT:",
    `Entry type: ${context.type}`,
    `Selected mood: ${mood.name || "unspecified"}`,
  ];
  if (context.text?.trim()) lines.push(`Original text: ${context.text.trim()}`);
  if (context.transcript?.trim()) lines.push(`Voice transcript: ${context.transcript.trim()}`);
  if (context.imageContext?.trim()) lines.push(`Photo context: ${context.imageContext.trim()}`);
  if (context.linkTitle?.trim()) lines.push(`Shared link title: ${context.linkTitle.trim()}`);
  if (context.linkSummary?.trim()) lines.push(`Shared link summary: ${context.linkSummary.trim()}`);
  if (context.source?.trim()) lines.push(`Shared link source: ${context.source.trim()}`);
  return lines;
}

function moodToneGuidance(moodName: string): string {
  const m = moodName.toLowerCase();
  const gentle = ["heavy", "sad", "anxious", "drained", "frustrated", "low", "tired", "overwhelmed", "angry", "lonely"];
  const light = ["calm", "excited", "inspired", "focused", "playful", "happy", "grateful", "content", "curious", "hopeful"];
  if (gentle.some((k) => m.includes(k))) {
    return "The selected mood is on the heavier side. Keep the questions gentle, grounded, and non-pushy.";
  }
  if (light.some((k) => m.includes(k))) {
    return "The selected mood is lighter. The questions may feel a little more curious and energetic, while staying calm.";
  }
  return "Let the questions be shaped by the selected mood, staying calm and natural.";
}

// ── Step A: questions ──────────────────────────────────────────────────────

export function buildQuestionsPrompt(
  context: UnpackContextInput,
  mood: UnpackMoodInput,
  profileContext?: string | null,
): string {
  const typeHint =
    context.type === "link"
      ? "This is a shared link. Ask about why the content stood out to the user, not only what the content is about."
      : context.type === "photo"
        ? "This is a photo. Ask about what made the image worth saving."
        : context.type === "voice"
          ? "This is a voice note. Ask about the thought or emotion behind what they said."
          : "This is a written thought. Ask about what stood out and what they want to remember.";

  const parts = [
    "TASK: generate_questions",
    "",
    ...buildEntryContextLines(context, mood),
    "",
    "QUESTION RULES:",
    "- Generate exactly 3 clarifying questions.",
    "- Each question should be short, easy to answer in a text field, and feel natural.",
    "- Help clarify the moment without therapy language, diagnosis, or multiple-choice formatting.",
    "- Do not be too intense, do not assume too much, do not ask the user to explain everything.",
    `- ${typeHint}`,
    `- ${moodToneGuidance(mood.name)}`,
    "",
    "Good examples: \"What part of this stood out the most?\", \"What made this feel worth saving?\", \"What do you want to remember about this later?\"",
    ...buildProfileContextSection(profileContext),
    "",
    "OUTPUT FORMAT (JSON only):",
    "{",
    "  \"mode\": \"questions\",",
    "  \"questions\": [",
    "    { \"id\": \"q1\", \"question\": \"\" },",
    "    { \"id\": \"q2\", \"question\": \"\" },",
    "    { \"id\": \"q3\", \"question\": \"\" }",
    "  ]",
    "}",
  ];
  return parts.join("\n");
}

// ── Step B: reflection ─────────────────────────────────────────────────────

export function buildReflectionPrompt(
  context: UnpackContextInput,
  mood: UnpackMoodInput,
  answers: UnpackAnswerInput[],
  profileContext?: string | null,
): string {
  const answerBlock = answers.length
    ? answers
        .map((a, i) =>
          a.skipped
            ? `Q${i + 1}: ${a.question}\nA${i + 1}: (skipped)`
            : `Q${i + 1}: ${a.question}\nA${i + 1}: ${a.answer.trim() || "(no answer)"}`,
        )
        .join("\n\n")
    : "(no answers provided)";

  const parts = [
    "TASK: generate_reflection",
    "",
    ...buildEntryContextLines(context, mood),
    "",
    "CLARIFYING ANSWERS:",
    answerBlock,
    "",
    "REFLECTION RULES:",
    "- Write in FIRST PERSON, as the user (\"I noticed...\").",
    "- Preserve the user's voice. Do not exaggerate or invent major facts.",
    "- Do not sound like a therapist. Do not make hard claims about the user's personality.",
    "- Connect the original moment, the selected mood, and the answers.",
    "- Include subtle insight without sounding preachy.",
    "- Never use dashes (em dash, en dash, or hyphens as punctuation). Use commas or periods instead.",
    "- Length: 1 to 3 short paragraphs, usually 80 to 180 words.",
    "- If some answers were skipped, still write a clean reflection from the available context.",
    "- This is a DRAFT the user will review. Do not imply it has been saved.",
    "",
    "Also return: a suggested title, a suggested mood label, 3 to 6 themes/tags, and 2 to 4 short insight signals useful for weekly/monthly insights (e.g. \"work pressure\", \"creative momentum\", \"quiet reset\").",
    ...buildProfileContextSection(profileContext),
    "",
    "OUTPUT FORMAT (JSON only):",
    "{",
    "  \"mode\": \"reflection\",",
    "  \"title\": \"\",",
    "  \"reflection\": \"\",",
    "  \"suggestedMood\": \"\",",
    "  \"themes\": [],",
    "  \"insightSignals\": [],",
    "  \"entryBadge\": \"Guided reflection\"",
    "}",
  ];
  return parts.join("\n");
}

// ── Vision step: image description ─────────────────────────────────────────

export const IMAGE_DESCRIBE_SYSTEM_PROMPT =
  `You describe a photo factually and briefly for a journaling assistant. State only what is visibly present: subjects, setting, notable objects, lighting, and overall mood of the scene. Do not speculate about the person's feelings, identity, or backstory. Do not add commentary. 1 to 3 plain sentences. No markdown.`;

export const IMAGE_DESCRIBE_PROMPT =
  `Describe this photo factually in 1 to 3 short sentences for journaling context.`;
