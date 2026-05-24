/**
 * Supabase Edge Function: extract-attachment
 *
 * Pulls a user's uploaded topic attachment from storage and uses Claude to
 * extract a readable text representation:
 *   - PDFs        → Claude document content block
 *   - Images      → Claude vision (description + readable text via OCR)
 *   - Plain text  → sent directly as text
 *   - Other       → marked as 'skipped'
 *
 * The extracted text is cached on `topic_attachments.extracted_text` and
 * reused by the topic AI features (Insight, Missing Gaps, Ask Obsy) — the
 * user only pays the extraction cost once per file.
 *
 * Envelope: { ok, attachmentId, extracted_text?, extraction_status, error? }
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

interface ExtractRequest {
    attachmentId: string;
}

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB ceiling for extraction
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const EXTRACTION_MAX_TOKENS = 2048;

const EXTRACT_PROMPT = `You are extracting content from a user's uploaded file so that downstream AI features can reason about it.

Your job:
1. Pull out the ALL readable text from the file (preserve meaningful structure but don't reproduce decorative formatting).
2. Add a short 1-2 sentence summary at the top describing what the file appears to be.

Output strict format:
SUMMARY: <one or two sentences>

CONTENT:
<the readable text, cleaned up>

Rules:
- No commentary, no markdown headings, no opinions.
- If the file is mostly visual (photo with no text), put a thorough visual description under CONTENT instead.
- If the file has no extractable content, output: SUMMARY: <description>\\n\\nCONTENT: (none)`;

interface JsonResponseInit {
    status?: number;
    headers?: Record<string, string>;
}

function jsonResponse(body: unknown, init: JsonResponseInit = {}) {
    return new Response(JSON.stringify(body), {
        status: init.status ?? 200,
        headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            ...(init.headers ?? {}),
        },
    });
}

function inferKind(mimeType: string | null): 'pdf' | 'image' | 'text' | 'other' {
    if (!mimeType) return 'other';
    const m = mimeType.toLowerCase();
    if (m === 'application/pdf') return 'pdf';
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('text/')) return 'text';
    if (m === 'application/json') return 'text';
    return 'other';
}

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(buf);
    const CHUNK = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
}

interface ClaudeContentBlock {
    type: string;
    text?: string;
    source?: {
        type: 'base64';
        media_type: string;
        data: string;
    };
}

async function callClaude(apiKey: string, content: ClaudeContentBlock[]): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: EXTRACTION_MAX_TOKENS,
            temperature: 0.2,
            messages: [
                { role: "user", content },
            ],
        }),
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Claude API ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? "";
    return text.trim();
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
        return jsonResponse({ ok: false, error: "missing_api_key" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
        return jsonResponse({ ok: false, error: "missing_auth" }, { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
        return jsonResponse({ ok: false, error: "missing_supabase_env" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
    });

    let body: ExtractRequest;
    try {
        body = (await req.json()) as ExtractRequest;
    } catch {
        return jsonResponse({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    if (!body?.attachmentId) {
        return jsonResponse({ ok: false, error: "missing_attachmentId" }, { status: 400 });
    }

    // 1. Load attachment row (RLS gates this to the owner).
    const { data: attachment, error: rowError } = await supabase
        .from("topic_attachments")
        .select("*")
        .eq("id", body.attachmentId)
        .single();

    if (rowError || !attachment) {
        return jsonResponse(
            { ok: false, error: "attachment_not_found", details: rowError?.message },
            { status: 404 },
        );
    }

    // 2. Mark as processing.
    await supabase
        .from("topic_attachments")
        .update({ extraction_status: "processing", extraction_error: null })
        .eq("id", attachment.id);

    // Size guard.
    if (attachment.size_bytes && attachment.size_bytes > MAX_FILE_BYTES) {
        await supabase
            .from("topic_attachments")
            .update({
                extraction_status: "skipped",
                extraction_error: `File too large (${attachment.size_bytes} bytes, max ${MAX_FILE_BYTES})`,
                extracted_at: new Date().toISOString(),
            })
            .eq("id", attachment.id);
        return jsonResponse({
            ok: true,
            attachmentId: attachment.id,
            extraction_status: "skipped",
            error: "file_too_large",
        });
    }

    const kind = inferKind(attachment.mime_type);
    if (kind === 'other') {
        await supabase
            .from("topic_attachments")
            .update({
                extraction_status: "skipped",
                extraction_error: `Unsupported mime type: ${attachment.mime_type ?? "unknown"}`,
                extracted_at: new Date().toISOString(),
            })
            .eq("id", attachment.id);
        return jsonResponse({
            ok: true,
            attachmentId: attachment.id,
            extraction_status: "skipped",
            error: "unsupported_type",
        });
    }

    // 3. Download file from storage. RLS on storage gates to owner.
    const { data: fileBlob, error: dlError } = await supabase.storage
        .from("topic-attachments")
        .download(attachment.storage_path);

    if (dlError || !fileBlob) {
        await supabase
            .from("topic_attachments")
            .update({
                extraction_status: "failed",
                extraction_error: `Storage download failed: ${dlError?.message ?? "unknown"}`,
                extracted_at: new Date().toISOString(),
            })
            .eq("id", attachment.id);
        return jsonResponse(
            { ok: false, error: "download_failed", details: dlError?.message },
            { status: 502 },
        );
    }

    try {
        let claudeContent: ClaudeContentBlock[];

        if (kind === 'text') {
            const text = await fileBlob.text();
            const truncated = text.length > 60_000 ? text.slice(0, 60_000) + "\n\n[truncated]" : text;
            claudeContent = [
                {
                    type: "text",
                    text:
                        `${EXTRACT_PROMPT}\n\n--- FILE CONTENT (filename: ${attachment.file_name}) ---\n${truncated}`,
                },
            ];
        } else {
            const buf = await fileBlob.arrayBuffer();
            const base64 = await arrayBufferToBase64(buf);
            const mediaType = attachment.mime_type ?? (kind === 'pdf' ? 'application/pdf' : 'image/jpeg');

            if (kind === 'pdf') {
                claudeContent = [
                    {
                        type: "document",
                        source: { type: "base64", media_type: mediaType, data: base64 },
                    },
                    { type: "text", text: EXTRACT_PROMPT },
                ];
            } else {
                // image
                claudeContent = [
                    {
                        type: "image",
                        source: { type: "base64", media_type: mediaType, data: base64 },
                    },
                    { type: "text", text: EXTRACT_PROMPT },
                ];
            }
        }

        const extracted = await callClaude(apiKey, claudeContent);
        const trimmed = extracted.slice(0, 30_000); // hard cap on what we store

        await supabase
            .from("topic_attachments")
            .update({
                extracted_text: trimmed,
                extraction_status: "done",
                extraction_error: null,
                extracted_at: new Date().toISOString(),
            })
            .eq("id", attachment.id);

        return jsonResponse({
            ok: true,
            attachmentId: attachment.id,
            extraction_status: "done",
            extracted_text: trimmed,
        });
    } catch (err: any) {
        const message = err?.message ?? "unknown error";
        await supabase
            .from("topic_attachments")
            .update({
                extraction_status: "failed",
                extraction_error: message.slice(0, 500),
                extracted_at: new Date().toISOString(),
            })
            .eq("id", attachment.id);
        return jsonResponse(
            { ok: false, error: "extraction_failed", details: message },
            { status: 500 },
        );
    }
});
