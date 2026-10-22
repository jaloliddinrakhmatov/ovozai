"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { VoiceServerMessage } from "@ovozai/contracts";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@ovozai/ui";
import { createTestSession } from "@/lib/voice-test-api";
import { describeError } from "@/lib/form";

type Status = "idle" | "connecting" | "in_call" | "ended" | "error";
type MicStatus = "off" | "granted" | "denied";
interface Caption {
  role: "AGENT" | "CALLER";
  text: string;
  language?: string;
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
  const [micStatus, setMicStatus] = useState<MicStatus>("off");
  const wsRef = useRef<WebSocket | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

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
  }, []);

  useEffect(() => () => closeWs(), [closeWs]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [captions]);

  const handleMessage = useCallback((message: VoiceServerMessage) => {
    switch (message.type) {
      case "state":
        if (message.state === "in_call") setStatus("in_call");
        if (message.state === "ended") setStatus((s) => (s === "error" ? s : "ended"));
        break;
      case "call":
        setCallId(message.callId);
        break;
      case "caption":
        setCaptions((prev) => [...prev, { role: message.role, text: message.text, language: message.language }]);
        break;
      case "error":
        setError(message.message);
        setStatus("error");
        break;
      default:
        break;
    }
  }, []);

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

  const enableMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMicStatus("granted");
    } catch {
      setMicStatus("denied");
    }
  };

  const connected = status === "in_call";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Test agent</h1>
          <p className="text-sm text-muted-foreground">
            A real voice session through the live pipeline (STT → LLM → TTS). Type-to-talk works
            now; live microphone speech-to-text activates once a real STT provider is configured.
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
            <Button variant="outline" onClick={() => void enableMic()}>
              {micStatus === "granted" ? "Microphone ready" : "Enable microphone"}
            </Button>
          </div>

          {micStatus === "granted" ? (
            <Alert>
              Microphone permission granted. Live speech-to-text turns on when a real STT provider
              (e.g. Google Chirp — see <code>docs/MULTILINGUAL_EVALUATION.md</code>) is configured;
              until then, use type-to-talk below to exercise the full pipeline.
            </Alert>
          ) : null}
          {micStatus === "denied" ? (
            <Alert variant="destructive">Microphone permission was denied.</Alert>
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
