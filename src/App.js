// import logo from './logo.svg';
// import './App.css';

// function App() {
//   return (
//     <div className="App">
//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.js</code> and save to reload.
//         </p>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

// export default App;
import React, { useState, useRef } from "react";

// const WS_URL = process.env.REACT_APP_WS_URL || "wss://your-hf-space.hf.space/ws";
const WS_URL = process.env.REACT_APP_WS_URL || "wss://muzair-010-voice-assistant-backend.hf.space/ws";
// If using a custom domain for HF, replace above.

export default function App() {
  const [connected, setConnected] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [replyText, setReplyText] = useState("");
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const inputRef = useRef(null);
  const streamRef = useRef(null);

  function floatTo16BitPCM(float32Array) {
    const l = float32Array.length;
    const buffer = new ArrayBuffer(l * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < l; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  }

  async function connectWs() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(WS_URL);
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      console.log("WS open");
      setConnected(true);
    };
    ws.onclose = () => {
      console.log("WS closed");
      setConnected(false);
    };
    ws.onerror = (e) => {
      console.error("WS error", e);
    };
    ws.onmessage = async (ev) => {
      // Expect JSON text messages with reply + audio_b64
      if (typeof ev.data === "string") {
        try {
          const parsed = JSON.parse(ev.data);
          if (parsed.type === "reply") {
            setReplyText(parsed.text || "");
            // play audio if present
            if (parsed.audio_b64) {
              const audioBytes = base64ToArrayBuffer(parsed.audio_b64);
              await playAudioBuffer(audioBytes);
            }
          } else if (parsed.type === "info") {
            console.log("info:", parsed);
          }
        } catch (e) {
          console.log("text message", ev.data);
        }
      } else {
        // binary message (not expected in current design)
        console.log("binary message received", ev.data);
      }
    };
    wsRef.current = ws;
  }

  function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  async function playAudioBuffer(arrayBuffer) {
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = audioContextRef.current;
    try {
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {
      console.error("Audio decode/play failed", e);
    }
  }

  async function startRecording() {
    await connectWs();
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert("WebSocket not connected");
      return;
    }

    // Get mic
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Create AudioContext at 16000 Hz to encourage resampling
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new AudioContextCtor({ sampleRate: 16000 });
    const ctx = audioContextRef.current;

    // Create source and processor
    const source = ctx.createMediaStreamSource(stream);
    // Use ScriptProcessorNode for broad compatibility (AudioWorklet recommended in prod)
    const bufferSize = 4096;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0); // Float32Array
      const pcm16 = floatTo16BitPCM(inputData);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(pcm16);
      }
    };

    source.connect(processor);
    processor.connect(ctx.destination); // necessary on some browsers

    processorRef.current = processor;
    inputRef.current = source;
    setRecording(true);
  }

  async function stopRecording() {
    // send end signal so server will process the buffered bytes
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: "end" }));
    }

    // stop audio processing
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (e) {}
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }
    if (inputRef.current) {
      try {
        inputRef.current.disconnect();
      } catch (e) {}
      inputRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  }

  return (
    <div style={{ padding: 24 }}>
      <h2>Speech Streamer (frontend)</h2>
      <div>
        <button onClick={connectWs} disabled={connected}>
          Connect WebSocket
        </button>
        <span style={{ marginLeft: 12 }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div style={{ marginTop: 12 }}>
        {!recording ? (
          <button onClick={startRecording} disabled={!connected}>
            Start
          </button>
        ) : (
          <button onClick={stopRecording}>Stop</button>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <strong>Assistant Reply:</strong>
        <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{replyText}</div>
      </div>
    </div>
  );
}
