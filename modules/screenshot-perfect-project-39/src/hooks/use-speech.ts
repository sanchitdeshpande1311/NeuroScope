import { useCallback, useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;

export type MicError = "unsupported" | "denied" | "no-speech" | "failed" | null;

export function useSpeechRecognition(lang: string, onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<MicError>(null);
  const recRef = useRef<Rec>(null);
  const cancelled = useRef(false);
  const gotText = useRef(false);
  const audio = useRef<{ stream?: MediaStream; ctx?: AudioContext; raf?: number }>({});
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const stopAudio = () => {
    const a = audio.current;
    if (a.raf) cancelAnimationFrame(a.raf);
    a.stream?.getTracks().forEach((t) => t.stop());
    a.ctx?.close().catch(() => {});
    audio.current = {};
    setLevel(0);
  };

  const start = useCallback(async () => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return setError("unsupported");
    setError(null);
    setInterim("");
    cancelled.current = false;
    gotText.current = false;

    // Request mic (permission prompt) + real audio level meter. Audio stays local.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        audio.current.raf = requestAnimationFrame(tick);
      };
      audio.current = { stream, ctx };
      tick();
    } catch (e: any) {
      if (e?.name === "NotAllowedError" || e?.name === "SecurityError") return setError("denied");
    }

    const rec: Rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (ev: any) => {
      let fin = "";
      let tmp = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else tmp += r[0].transcript;
      }
      if (fin.trim()) {
        gotText.current = true;
        if (!cancelled.current) onFinalRef.current(fin.trim());
      }
      setInterim(tmp);
    };
    rec.onerror = (ev: any) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setError("denied");
      else if (ev.error === "no-speech") setError("no-speech");
      else if (ev.error !== "aborted") setError("failed");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
      stopAudio();
      if (!cancelled.current && !gotText.current) setError((e) => e ?? "no-speech");
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("failed");
      stopAudio();
    }
  }, [lang]);

  const stop = useCallback(() => recRef.current?.stop(), []);
  const cancel = useCallback(() => {
    cancelled.current = true;
    recRef.current?.abort();
  }, []);

  useEffect(() => () => {
    recRef.current?.abort();
    stopAudio();
  }, []);

  return { supported, listening, interim, level, error, setError, start, stop, cancel };
}

export function useSpeechSynthesis() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const stop = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback(
    (id: string, text: string, lang: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const plain = text
        .replace(/```[\s\S]*?```/g, " code block omitted. ")
        .replace(/\$+([^$]+)\$+/g, "$1")
        .replace(/[#*_`>|]/g, "");
      const u = new SpeechSynthesisUtterance(plain);
      u.lang = lang;
      u.onend = u.onerror = () => setSpeakingId((s) => (s === id ? null : s));
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  return { supported, speakingId, speak, stop };
}
