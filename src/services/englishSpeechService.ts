// Client-side English TTS, Speech-to-Text, and Voice Self-Recording utilities

let activeUtterance: SpeechSynthesisUtterance | null = null;

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeaking(): void {
  if (!isTtsSupported()) return;
  try {
    window.speechSynthesis.cancel();
    activeUtterance = null;
  } catch {
    // ignore
  }
}

export function speakEnglish(
  text: string,
  options?: { rate?: number; lang?: 'en-US' | 'en-GB'; onStart?: () => void; onEnd?: () => void }
): void {
  if (!isTtsSupported() || !text.trim()) {
    options?.onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.lang = options?.lang || 'en-US';
    utterance.rate = options?.rate ?? 0.95;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find(v => v.lang === utterance.lang && /natural|google|samantha|daniel|aria/i.test(v.name)) ||
      voices.find(v => v.lang.startsWith('en'));
    if (preferred) {
      utterance.voice = preferred;
    }

    utterance.onstart = () => options?.onStart?.();
    utterance.onend = () => {
      activeUtterance = null;
      options?.onEnd?.();
    };
    utterance.onerror = () => {
      activeUtterance = null;
      options?.onEnd?.();
    };

    activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  } catch {
    options?.onEnd?.();
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

export interface SpeechRecognizerHandle {
  stop: () => void;
}

export function startEnglishSpeechRecognition(callbacks: {
  onTranscript: (finalText: string, interimText: string) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
}): SpeechRecognizerHandle | null {
  if (!isSpeechRecognitionSupported()) {
    callbacks.onError?.('এই ব্রাউজারে সরাসরি ভয়েস-টু-টেক্সট সাপোর্ট নেই; অনুগ্রহ করে টাইপ করে উত্তর দিন।');
    return null;
  }

  const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRec();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  let accumulatedFinal = '';

  recognition.onresult = (event: any) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        accumulatedFinal += (accumulatedFinal ? ' ' : '') + res[0].transcript.trim();
      } else {
        interim += res[0].transcript;
      }
    }
    callbacks.onTranscript(accumulatedFinal, interim);
  };

  recognition.onerror = (event: any) => {
    const code = event?.error || 'unknown';
    if (code === 'not-allowed') {
      callbacks.onError?.('মাইক্রোফোন অনুমতি দেওয়া হয়নি। ব্রাউজার থেকে মাইক্রোফোন চালু করুন অথবা টাইপ করে উত্তর দিন।');
    } else if (code !== 'aborted') {
      callbacks.onError?.('ভয়েস শনাক্ত করতে সমস্যা হয়েছে; আবার চেষ্টা করুন অথবা টাইপ করুন।');
    }
  };

  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    callbacks.onError?.('ভয়েস রেকর্ডিং শুরু করা যায়নি।');
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // ignore
      }
    },
  };
}

export interface VoiceRecorderSession {
  stop: () => Promise<string | null>;
}

export async function startSelfVoiceRecording(): Promise<VoiceRecorderSession | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return null;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.start();

    return {
      stop: () =>
        new Promise<string | null>(resolve => {
          recorder.onstop = () => {
            stream.getTracks().forEach(t => t.stop());
            if (chunks.length === 0) {
              resolve(null);
              return;
            }
            const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
            resolve(URL.createObjectURL(blob));
          };
          try {
            recorder.stop();
          } catch {
            stream.getTracks().forEach(t => t.stop());
            resolve(null);
          }
        }),
    };
  } catch {
    return null;
  }
}
