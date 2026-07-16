import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Image } from "react-native";
import { Ionicons } from "./icons";
import {
  useAudioRecorder,
  useAudioPlayer,
  useAudioPlayerStatus,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";

/**
 * Cross-platform audio helpers for BLACKSCLUB.
 * - Recorder: tap-to-record (web + native). Emits base64 data URL + mime.
 * - Player: play/pause a recorded audio (base64 data URL).
 *
 * Uses expo-audio (moderno, substitui o deprecado expo-av).
 * Web: usa MediaRecorder API com preferência por audio/mp4 (mais compatível
 *      cross-browser — Safari + Chrome + Firefox tocam sem problema).
 *
 * Audio é armazenado inline em mensagens de chat como: [AUD]<data-url>[/AUD]
 */

export type RecordedAudio = {
  base64: string;       // data URL (audio/webm;base64,... or audio/mp4;base64,...)
  mime: string;         // MIME
  duration_ms: number;
};

// ---------- RECORDER ----------

async function _requestPerm(): Promise<boolean> {
  try {
    const r = await AudioModule.requestRecordingPermissionsAsync();
    return r.granted || r.status === "granted";
  } catch {
    return false;
  }
}

export function AudioRecorderButton({
  onRecorded,
  maxMs = 60_000,
  color = "#D4AF37",
  testID,
}: {
  onRecorded: (a: RecordedAudio) => void;
  maxMs?: number;
  color?: string;
  testID?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Native recorder (expo-audio) — usado em iOS/Android
  const nativeRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // Web recorder (MediaRecorder API)
  const webRecRef = useRef<any>(null);
  const webStreamRef = useRef<MediaStream | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webMimeRef = useRef<string>("audio/webm");

  const startTsRef = useRef<number>(0);
  const timerRef = useRef<any>(null);
  const stoppingRef = useRef<boolean>(false);

  const stopWebStream = () => {
    if (webStreamRef.current) {
      webStreamRef.current.getTracks().forEach((t) => t.stop());
      webStreamRef.current = null;
    }
  };

  const stop = useCallback(async () => {
    if (!recording || stoppingRef.current) return;
    stoppingRef.current = true;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const duration_ms = Date.now() - startTsRef.current;

    try {
      if (Platform.OS === "web" && webRecRef.current) {
        const rec = webRecRef.current;
        await new Promise<void>((resolve) => {
          const done = async () => {
            const blob = new Blob(webChunksRef.current, { type: webMimeRef.current });
            webChunksRef.current = [];
            const dataUrl = await new Promise<string>((res) => {
              const r = new FileReader();
              r.onloadend = () => res((r.result as string) || "");
              r.onerror = () => res("");
              r.readAsDataURL(blob);
            });
            if (dataUrl && duration_ms > 400) {
              onRecorded({ base64: dataUrl, mime: webMimeRef.current, duration_ms });
            }
            resolve();
          };
          rec.onstop = done;
          try { rec.stop(); } catch { done(); }
        });
        webRecRef.current = null;
        stopWebStream();
      } else {
        // Native (expo-audio) — para de gravar e lê o arquivo
        try {
          await nativeRecorder.stop();
        } catch { /* já parado */ }
        const uri = nativeRecorder.uri;
        if (uri && duration_ms > 400) {
          try {
            const res = await fetch(uri);
            const blob = await res.blob();
            const dataUrl = await new Promise<string>((r) => {
              const fr = new FileReader();
              fr.onloadend = () => r((fr.result as string) || "");
              fr.onerror = () => r("");
              fr.readAsDataURL(blob);
            });
            const mime = blob.type || "audio/m4a";
            if (dataUrl) onRecorded({ base64: dataUrl, mime, duration_ms });
          } catch { /* ignora falha de leitura */ }
        }
      }
    } catch { /* silencia */ }
    setElapsed(0);
    stoppingRef.current = false;
  }, [recording, nativeRecorder, onRecorded]);

  const start = async () => {
    if (recording || stoppingRef.current) return;
    const ok = await _requestPerm();
    if (!ok) return;
    try {
      if (Platform.OS === "web") {
        const nav: any = (globalThis as any).navigator;
        if (!nav?.mediaDevices?.getUserMedia) return;
        const stream = await nav.mediaDevices.getUserMedia({ audio: true });
        webStreamRef.current = stream;
        const MR: any = (globalThis as any).MediaRecorder;
        if (!MR) { stopWebStream(); return; }
        // Prefere codecs mais compatíveis cross-browser (mp4 toca em Safari + Chrome + Firefox modernos)
        const mimeCandidates = [
          "audio/mp4;codecs=mp4a.40.2",
          "audio/mp4",
          "audio/webm;codecs=opus",
          "audio/webm",
        ];
        let mime = "audio/webm";
        for (const c of mimeCandidates) {
          if (MR.isTypeSupported && MR.isTypeSupported(c)) { mime = c; break; }
        }
        webMimeRef.current = mime.split(";")[0];
        const rec = new MR(stream, { mimeType: mime });
        webChunksRef.current = [];
        rec.ondataavailable = (e: any) => { if (e.data && e.data.size) webChunksRef.current.push(e.data); };
        rec.start(250);
        webRecRef.current = rec;
      } else {
        // Native (expo-audio)
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        } as any);
        await nativeRecorder.prepareToRecordAsync();
        nativeRecorder.record();
      }
      startTsRef.current = Date.now();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        const e = Date.now() - startTsRef.current;
        setElapsed(e);
        if (e >= maxMs) stop();
      }, 200);
    } catch { setRecording(false); }
  };

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    stopWebStream();
  }, []);

  if (recording) {
    const sec = Math.floor(elapsed / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return (
      <TouchableOpacity
        style={[recStyles.recActive, { backgroundColor: "#F87171" }]}
        onPress={stop}
        testID={testID ? `${testID}-stop` : "audio-recorder-stop"}
      >
        <View style={recStyles.dot} />
        <Text style={recStyles.recTimer}>{mm}:{ss}</Text>
        <Ionicons name="stop" size={14} color="#FFF" />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={recStyles.recIdle}
      onPress={start}
      testID={testID || "audio-recorder-start"}
      activeOpacity={0.7}
    >
      <Ionicons name="mic" size={22} color={color} />
    </TouchableOpacity>
  );
}

// ---------- PLAYER ----------

export function AudioPlayer({
  src,
  accent = "#D4AF37",
  bgColor = "#1A1A1A",
  textColor = "#EEE",
  durationHintMs,
  senderAvatar,
  senderName,
}: {
  src: string;
  accent?: string;
  bgColor?: string;
  textColor?: string;
  durationHintMs?: number;
  senderAvatar?: string | null;
  senderName?: string;
}) {
  const [errored, setErrored] = useState(false);
  const player = useAudioPlayer({ uri: src });
  const status = useAudioPlayerStatus(player);

  const playing = !!status?.playing;
  const loading = !!status?.isBuffering && !playing && !status?.currentTime;
  const durationMs = ((status?.duration ?? 0) * 1000) || durationHintMs || 0;
  const positionMs = (status?.currentTime ?? 0) * 1000;
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  // Ao terminar, volta para 0 e pausa
  useEffect(() => {
    if (status?.didJustFinish) {
      try {
        player.pause();
        player.seekTo(0);
      } catch { /* ignora */ }
    }
  }, [status?.didJustFinish, player]);

  // Se o player falha ao carregar (áudio corrompido / codec não suportado)
  useEffect(() => {
    // expo-audio expõe status.reasonForWaitingToPlay / status.playbackError em algumas versões
    const err = (status as any)?.playbackError;
    if (err) setErrored(true);
  }, [status]);

  useEffect(() => {
    // Cleanup ao desmontar
    return () => {
      try { player.pause(); } catch { /* noop */ }
    };
  }, [player]);

  const toggle = () => {
    if (errored) return;
    try {
      if (playing) player.pause();
      else player.play();
    } catch {
      setErrored(true);
    }
  };

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <View style={[plStyles.box, { backgroundColor: bgColor }]}>
      {/* Avatar do remetente (se fornecido) */}
      {senderAvatar ? (
        <Image source={{ uri: senderAvatar }} style={plStyles.avatar} resizeMode="cover" />
      ) : senderName ? (
        <View style={[plStyles.avatar, plStyles.avatarFallback]}>
          <Text style={plStyles.avatarInitial}>{senderName.charAt(0).toUpperCase()}</Text>
        </View>
      ) : null}

      {/* Play/Pause / Erro */}
      <TouchableOpacity
        style={[plStyles.playBtn, { backgroundColor: "#FFFFFF", shadowColor: accent, opacity: errored ? 0.5 : 1 }]}
        onPress={toggle}
        disabled={errored}
        testID="audio-player-toggle"
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#000" size="small" /> : (
          <Ionicons
            name={errored ? "alert-circle" : (playing ? "pause" : "play")}
            size={18}
            color="#000"
            style={{ marginLeft: errored ? 0 : (playing ? 0 : 2) }}
          />
        )}
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 80 }}>
        <View style={plStyles.track}>
          <View style={[plStyles.fill, { width: `${Math.max(4, progress * 100)}%`, backgroundColor: accent }]} />
        </View>
        <View style={plStyles.timeRow}>
          <Text style={[plStyles.time, { color: textColor }]}>{errored ? "Falha ao carregar áudio" : fmt(positionMs)}</Text>
          {!errored && durationMs > 0 ? <Text style={[plStyles.time, { color: textColor }]}>{fmt(durationMs)}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const recStyles = StyleSheet.create({
  recIdle: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  recActive: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, height: 38, borderRadius: 19,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFF" },
  recTimer: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
});

const plStyles = StyleSheet.create({
  box: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14,
    minWidth: 200,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: "#D4AF37",
  },
  avatarFallback: {
    backgroundColor: "#2A2A2A", alignItems: "center", justifyContent: "center",
  },
  avatarInitial: { color: "#EEE", fontSize: 13, fontWeight: "900" },
  playBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: "#D4AF37",
  },
  track: {
    height: 4, borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  fill: { height: 4, borderRadius: 2 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  time: { fontSize: 10, fontWeight: "700", opacity: 0.85 },
});
