import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { audioUrl, language = 'en' } = await req.json();

    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'audioUrl is required', transcript: '' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not set');
      return new Response(
        JSON.stringify({ error: 'Transcription service unavailable', transcript: '' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the audio file from Supabase Storage
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.status}`);
    }
    const audioBlob = await audioResponse.blob();

    // Send to Whisper API
    const formData = new FormData();
    formData.append('file', audioBlob, 'voice-note.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', language);

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      throw new Error(`Whisper API error: ${whisperResponse.status} ${errText}`);
    }

    const result = await whisperResponse.json();

    return new Response(
      JSON.stringify({ transcript: result.text || '', error: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[transcribe-voice-note]', err);
    return new Response(
      JSON.stringify({ transcript: '', error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
