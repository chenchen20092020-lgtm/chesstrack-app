import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';

// Requests microphone permission and returns whether it was granted.
export async function requestMicPermission(): Promise<boolean> {
  try {
    const response = await requestRecordingPermissionsAsync();
    return response.granted;
  } catch {
    return false;
  }
}

// Starts a new recording after requesting permission and configuring audio mode.
export async function startRecording(): Promise<AudioRecorder | null> {
  try {
    const granted = await requestMicPermission();
    if (!granted) {
      return null;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    const recorder: AudioRecorder = new AudioModule.AudioRecorder(
      RecordingPresets.HIGH_QUALITY
    );
    await recorder.prepareToRecordAsync();
    recorder.record();
    return recorder;
  } catch {
    return null;
  }
}

// Stops the active recording and returns its file URI.
export async function stopRecording(
  recorder: AudioRecorder
): Promise<string | null> {
  try {
    await recorder.stop();
    const uri = recorder.uri;
    return uri ?? null;
  } catch {
    return null;
  }
}

// Checks basic network reachability by pinging the Groq API host.
export async function isOnline(): Promise<boolean> {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      method: 'HEAD',
    });
    return response.status > 0;
  } catch {
    return false;
  }
}

// Sends an audio file to Groq Whisper and returns the transcribed text.
export async function transcribeAudio(
  audioUri: string
): Promise<string | null> {
  try {
    const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
    if (!apiKey) {
      return null;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as any);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'en');
    formData.append('response_format', 'json');

    const response = await fetch(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { text?: string };
    return data.text ?? null;
  } catch {
    return null;
  }
}

// Summarizes a transcription into bullet points or a short paragraph via Groq LLaMA.
export async function summarizeTranscription(
  text: string,
  format: 'bullets' | 'paragraph'
): Promise<string | null> {
  try {
    const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
    if (!apiKey) {
      return null;
    }

    const systemPrompt =
      format === 'bullets'
        ? "You are a direct chess coach. Turn the player's spoken reflection on their game into 3-4 short, concrete takeaways they can act on. Be honest and specific: if they describe a mistake, name it plainly and say what to do instead next time. Each bullet starts with •. Use only what the player actually said — do not invent moves, evaluations, or facts."
        : "You are a direct chess coach. Turn the player's spoken reflection into a concise 2-3 sentence takeaway. Be honest and specific about what went wrong and what to focus on next, using only what the player actually said. Do not invent moves, evaluations, or facts.";

    const response = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
          max_tokens: 200,
          temperature: 0.3,
        }),
      }
    );

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    if (!response.ok) {
      return null;
    }
    const content = data.choices?.[0]?.message?.content;
    return content ? content.trim() : null;
  } catch {
    return null;
  }
}
