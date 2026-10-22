"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { VoiceServerMessage } from "@ovozai/contracts";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ovozai/ui";
import { createTestSession } from "@/lib/voice-test-api";
import { describeError } from "@/lib/form";

type Status = "idle" | "connecting" | "in_call" | "ended" | "error";
interface Caption {
  role: "AGENT" | "CALLER";
  text: string;
  language?: string;
}

// Minimal typing for the browser's free Web Speech API (Chrome).
interface SpeechRecognitionResultLike extends ArrayLike<{ transcript: string }> {
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function bcp47(language: string): string {
  return language === "uz" ? "uz-UZ" : language === "ru" ? "ru-RU" : "en-US";
}

/** Speak text aloud with the browser's free TTS (Web Speech API). */
function speakText(text: string, language: string): void {
  try {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = bcp47(language);
    synth.speak(utterance);
  } catch {
    /* speech synthesis unavailable */
  }
}

const STATUS_LABEL: Record<Status, string> = {
  idle: "Not connected",
  connecting: "Connecting…",
  in_call: "Live",
  ended: "Call ended",
  error: "Error",
};
const STATUS_VARIANT = {
  idle: "secondary",
  connecting: "outline",
  in_call: "success",
  ended: "secondary",
  error: "destructive",
} as const;

export default function TestAgentPage() {
  const agentId = useParams<{ id: string }>().id;
  const [status, setStatus] = useState<Status>("idle");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("uz");
  const [speakResponses, setSpeakResponses] = useState(true);
  const [listening, setListening] = useState(false);
  const [serverAudio, setServerAudio] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechBufferRef = useRef("");
  const manualStopRef = useRef(false);
  const optsRef = useRef({ speak: true, language: "uz" });
  const serverAudioRef = useRef(false);
  const audioQueueRef = useRef<string[]>([]);
  const audioPlayingRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    optsRef.current = { speak: speakResponses, language };
  }, [speakResponses, language]);

  const closeWs = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    try {
      audioElRef.current?.pause();
    } catch {
      /* ignore */
    }
    audioElRef.current = null;
    audioPlayingRef.current = false;
    audioQueueRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioQueueRef.current = [];
  }, []);

  useEffect(
    () => () => {
      closeWs();
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [closeWs],
  );

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [captions]);

  const playNext = useCallback(() => {
    if (audioPlayingRef.current) return;
    const url = audioQueueRef.current.shift();
    if (!url) return;
    audioPlayingRef.current = true;
    const el = new Audio(url);
    audioElRef.current = el;
    const done = () => {
      URL.revokeObjectURL(url);
      audioPlayingRef.current = false;
      audioElRef.current = null;
      playNext();
    };
    el.onended = done;
    el.onerror = done;
    void el.play().catch(done);
  }, []);

  const enqueueAudio = useCallback(
    (mime: string, base64: string) => {
      try {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        audioQueueRef.current.push(URL.createObjectURL(new Blob([bytes], { type: mime })));
        playNext();
      } catch {
        /* ignore bad audio frame */
      }
    },
    [playNext],
  );

  const handleMessage = useCallback(
    (message: VoiceServerMessage) => {
      switch (message.type) {
        case "config":
          serverAudioRef.current = message.serverAudio;
          setServerAudio(message.serverAudio);
          break;
        case "state":
          if (message.state === "in_call") setStatus("in_call");
          if (message.state === "ended") setStatus((s) => (s === "error" ? s : "ended"));
          break;
        case "call":
          setCallId(message.callId);
          break;
        case "caption":
          setCaptions((prev) => [...prev, { role: message.role, text: message.text, language: message.language }]);
          // Speak with the browser only when the server is NOT sending real audio.
          if (message.role === "AGENT" && !serverAudioRef.current && optsRef.current.speak) {
            speakText(message.text, message.language ?? optsRef.current.language);
          }
          break;
        case "agent_audio":
          enqueueAudio(message.mime, message.dataBase64);
          break;
        case "error":
          setError(message.message);
          setStatus("error");
          break;
        default:
          break;
      }
    },
    [enqueueAudio],
  );

  const start = useCallback(async () => {
    closeWs();
    setStatus("connecting");
    setCaptions([]);
    setCallId(null);
    setError(null);
    try {
      const session = await createTestSession(agentId);
      const ws = new WebSocket(`${session.wsUrl}?ticket=${encodeURIComponent(session.ticket)}`);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          handleMessage(JSON.parse(String(event.data)) as VoiceServerMessage);
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onerror = () => {
        setError("WebSocket connection error. Is the voice-worker gateway running?");
        setStatus("error");
      };
      ws.onclose = () => setStatus((s) => (s === "error" ? s : "ended"));
    } catch (err) {
      setError(describeError(err).message);
      setStatus("error");
    }
  }, [agentId, closeWs, handleMessage]);

  const sendTurn = (event: FormEvent) => {
    event.preventDefault();
    const ws = wsRef.current;
    const text = input.trim();
    if (!ws || ws.readyState !== WebSocket.OPEN || !text) return;
    ws.send(JSON.stringify({ type: "caller_text", text, language }));
    setInput("");
  };

  const sendControl = (type: "barge_in" | "hangup") => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type }));
    if (type === "hangup") closeWs();
  };

  const sendCallerText = (raw: string) => {
    const text = raw.trim();
    const ws = wsRef.current;
    if (text && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "caller_text", text, language }));
    }
  };

  const toggleListening = () => {
    if (listening) {
      // Stop → send the WHOLE accumulated utterance as one turn.
      manualStopRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      sendCallerText(speechBufferRef.current);
      speechBufferRef.current = "";
      setInput("");
      setListening(false);
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Recognition) {
      setError("This browser has no speech recognition — use Chrome, or type below.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = bcp47(language);
    recognition.interimResults = true;
    recognition.continuous = true;
    speechBufferRef.current = "";
    manualStopRef.current = false;
    recognition.onresult = (event) => {
      // Rebuild the full transcript from all results (finals + current interim),
      // so nothing is sent until the user taps Stop.
      let full = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i]?.[0]?.transcript;
        if (piece) full += (full ? " " : "") + piece.trim();
      }
      speechBufferRef.current = full;
      setInput(full); // live preview while speaking
    };
    recognition.onend = () => {
      // Chrome often stops on a short pause — keep listening until the user stops.
      if (!manualStopRef.current) {
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      }
    };
    recognition.onerror = () => {
      if (!manualStopRef.current) setListening(false);
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const connected = status === "in_call";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Test agent</h1>
          <p className="text-sm text-muted-foreground">
            A real voice session with a live LLM. Speak (🎤 — free browser speech recognition) or
            type; the agent answers and talks back aloud. Server-side STT/TTS providers plug in for
            higher Uzbek quality (see docs/MULTILINGUAL_EVALUATION.md).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
          <Link
            href={`/dashboard/agents/${agentId}`}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Back to agent
          </Link>
        </div>
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Session</CardTitle>
          <CardDescription>
            Start a session, then speak with the agent. {callId ? (
              <>
                Call <Link href={`/dashboard/calls/${callId}`} className="underline">{callId.slice(0, 8)}…</Link> is
                being recorded in your call history.
              </>
            ) : (
              "A call record appears in Calls once connected."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <>
                <Button variant="outline" onClick={() => sendControl("barge_in")}>
                  Interrupt (barge-in)
                </Button>
                <Button variant="outline" onClick={() => sendControl("hangup")}>
                  Hang up
                </Button>
              </>
            ) : (
              <Button onClick={() => void start()} disabled={status === "connecting"}>
                {status === "connecting" ? "Connecting…" : "Start test call"}
              </Button>
            )}
            <Button variant="outline" onClick={toggleListening} disabled={!connected}>
              {listening ? "⏹ Stop & send" : "🎤 Speak"}
            </Button>
            {serverAudio ? (
              <span className="text-sm text-muted-foreground">🔊 Native voice (server TTS)</span>
            ) : (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={speakResponses}
                  onChange={(event) => setSpeakResponses(event.target.checked)}
                />
                Speak responses
              </label>
            )}
          </div>

          {listening ? (
            <Alert>
              🎙️ Listening in {language.toUpperCase()} — say your whole sentence, then tap{" "}
              <strong>Stop &amp; send</strong>. Your words appear live in the box below.
            </Alert>
          ) : null}

          <div
            ref={transcriptRef}
            className="h-72 overflow-y-auto rounded-md border border-border p-3 text-sm"
            aria-live="polite"
          >
            {captions.length === 0 ? (
              <p className="text-muted-foreground">
                The conversation transcript will appear here, newest at the bottom.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {captions.map((caption, index) => (
                  <li key={index} className="flex flex-col">
                    <span className="text-xs font-medium text-muted-foreground">
                      {caption.role === "AGENT" ? "Agent" : "You"}
                      {caption.language ? ` · ${caption.language.toUpperCase()}` : ""}
                    </span>
                    <span>{caption.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={sendTurn} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Language</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="uz">Uzbek</option>
                <option value="ru">Russian</option>
                <option value="en">English</option>
              </select>
            </label>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={connected ? "Type what the caller says…" : "Start a call to talk"}
              disabled={!connected}
              className="h-9 min-w-[16rem] flex-1 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            />
            <Button type="submit" disabled={!connected || !input.trim()}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
