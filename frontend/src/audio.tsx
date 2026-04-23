import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";

/**
 * Cross-platform audio helpers for BLACKSCLUB.
 * - Recorder: hold-to-record (web + native). Emits base64 data URL + mime.
 * - Player: play/pause a recorded audio (base64 data URL).
 *
 * Audio is stored inline in chat messages as:   [AUD]<data-url>[/AUD]
 */

export type RecordedAudio = {
  base64: string;       // data URL (audio/webm;base64,... or audio/m4a;base64,...)
  mime: string;         // MIME
  duration_ms: number;
};

// ---------- RECORDER ----------

async function _requestPerm() {
  try {
    const r = await Audio.requestPermissionsAsync();
    return r.granted || r.status === "granted";
  } catch { return false; }
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
  const recRef = useRef<Audio.Recording | null>(null);
  const webRecRef = useRef<any>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webMimeRef = useRef<string>("audio/webm");
  const startTsRef = useRef<number>(0);
  const timerRef = useRef<any>(null);

  const stop = async () => {
    if (!recording) return;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const duration_ms = Date.now() - startTsRef.current;
    try {
      if (Platform.OS === "web" && webRecRef.current) {
        const rec = webRecRef.current;
        await new Promise<void>((resolve) => {
          rec.onstop = async () => {
            const blob = new Blob(webChunksRef.current, { type: webMimeRef.current });
            webChunksRef.current = [];
            const dataUrl = await new Promise<string>((res) => {
              const r = new FileReader();
              r.onloadend = () => res((r.result as string) || "");
              r.readAsDataURL(blob);
            });
            if (dataUrl && duration_ms > 400) {
              onRecorded({ base64: dataUrl, mime: webMimeRef.current, duration_ms });
            }
            resolve();
          };
          try { rec.stop(); } catch { resolve(); }
        });
        webRecRef.current = null;
      } else if (recRef.current) {
        const rec = recRef.current;
        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        recRef.current = null;
        if (uri && duration_ms > 400) {
          const res = await fetch(uri);
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((r) => {
            const fr = new FileReader();
            fr.onloadend = () => r((fr.result as string) || "");
            fr.readAsDataURL(blob);
          });
          const mime = blob.type || "audio/m4a";
          onRecorded({ base64: dataUrl, mime, duration_ms });
        }
      }
    } catch { /* silencia */ }
    setElapsed(0);
  };

  const start = async () => {
    if (recording) return;
    const ok = await _requestPerm();
    if (!ok) return;
    try {
      if (Platform.OS === "web") {
        const nav: any = (globalThis as any).navigator;
        if (!nav?.mediaDevices?.getUserMedia) return;
        const stream = await nav.mediaDevices.getUserMedia({ audio: true });
        const MR: any = (globalThis as any).MediaRecorder;
        const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
        let mime = "audio/webm";
        for (const c of mimeCandidates) {
          if (MR && MR.isTypeSupported && MR.isTypeSupported(c)) { mime = c; break; }
        }
        webMimeRef.current = mime.split(";")[0];
        const rec = new MR(stream, { mimeType: mime });
        webChunksRef.current = [];
        rec.ondataavailable = (e: any) => { if (e.data && e.data.size) webChunksRef.current.push(e.data); };
        rec.start(250);
        webRecRef.current = rec;
      } else {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        } as any);
        const rec = new Audio.Recording();
        await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        await rec.startAsync();
        recRef.current = rec;
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

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  if (recording) {
    const sec = Math.floor(elapsed / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return (
      <TouchableOpacity
        style={[recStyles.recActive, { backgroundColor: "#F87171" }]}
        onPress={stop}
        testID={testID || "audio-recorder-stop"}
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
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [durationMs, setDurationMs] = useState<number | null>(durationHintMs || null);
  const [positionMs, setPositionMs] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => () => { if (soundRef.current) { soundRef.current.unloadAsync().catch(() => {}); } }, []);

  const toggle = async () => {
    if (playing) {
      await soundRef.current?.pauseAsync();
      setPlaying(false);
      return;
    }
    setLoading(true);
    try {
      if (!soundRef.current) {
        const { sound, status } = await Audio.Sound.createAsync({ uri: src }, { shouldPlay: true });
        soundRef.current = sound;
        if (status.isLoaded && status.durationMillis) setDurationMs(status.durationMillis);
        sound.setOnPlaybackStatusUpdate((s: any) => {
          if (!s.isLoaded) return;
          if (s.durationMillis) setDurationMs(s.durationMillis);
          setPositionMs(s.positionMillis || 0);
          if (s.durationMillis) setProgress((s.positionMillis || 0) / s.durationMillis);
          if (s.didJustFinish) {
            setPlaying(false); setProgress(0); setPositionMs(0);
            sound.setPositionAsync(0).catch(() => {});
          }
        });
      } else {
        await soundRef.current.playAsync();
      }
      setPlaying(true);
    } catch { setPlaying(false); }
    finally { setLoading(false); }
  };

  const total = durationMs || durationHintMs || 0;
  const pos = positionMs || 0;
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

      {/* Play/Pause — BRILHANTE com glow dourado */}
      <TouchableOpacity
        style={[plStyles.playBtn, { backgroundColor: "#FFFFFF", shadowColor: accent }]}
        onPress={toggle}
        testID="audio-player-toggle"
        activeOpacity={0.8}
      >
        {loading ? <ActivityIndicator color="#000" size="small" /> : (
          <Ionicons name={playing ? "pause" : "play"} size={18} color="#000" style={{ marginLeft: playing ? 0 : 2 }} />
        )}
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 80 }}>
        <View style={plStyles.track}>
          <View style={[plStyles.fill, { width: `${Math.max(4, progress * 100)}%`, backgroundColor: accent }]} />
        </View>
        <View style={plStyles.timeRow}>
          <Text style={[plStyles.time, { color: textColor }]}>{fmt(pos)}</Text>
          {total > 0 ? <Text style={[plStyles.time, { color: textColor }]}>{fmt(total)}</Text> : null}
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
    // Glow dourado para destaque
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
    // Borda sutil dourada
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
