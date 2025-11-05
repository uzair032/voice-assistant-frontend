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

// // export default App;
// import React, { useState, useRef } from "react";

// // const WS_URL = process.env.REACT_APP_WS_URL || "wss://your-hf-space.hf.space/ws";
// const WS_URL = process.env.REACT_APP_WS_URL || "wss://muzair-010-voice-assistant-backend.hf.space/ws";
// // If using a custom domain for HF, replace above.

// export default function App() {
//   const [connected, setConnected] = useState(false);
//   const [recording, setRecording] = useState(false);
//   const [transcript, setTranscript] = useState("");
//   const [replyText, setReplyText] = useState("");
//   const wsRef = useRef(null);
//   const audioContextRef = useRef(null);
//   const processorRef = useRef(null);
//   const inputRef = useRef(null);
//   const streamRef = useRef(null);

//   function floatTo16BitPCM(float32Array) {
//     const l = float32Array.length;
//     const buffer = new ArrayBuffer(l * 2);
//     const view = new DataView(buffer);
//     let offset = 0;
//     for (let i = 0; i < l; i++, offset += 2) {
//       let s = Math.max(-1, Math.min(1, float32Array[i]));
//       view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
//     }
//     return buffer;
//   }

//   async function connectWs() {
//     if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
//     const ws = new WebSocket(WS_URL);
//     ws.binaryType = "arraybuffer";
//     ws.onopen = () => {
//       console.log("WS open");
//       setConnected(true);
//     };
//     ws.onclose = () => {
//       console.log("WS closed");
//       setConnected(false);
//     };
//     ws.onerror = (e) => {
//       console.error("WS error", e);
//     };
//     ws.onmessage = async (ev) => {
//       // Expect JSON text messages with reply + audio_b64
//       if (typeof ev.data === "string") {
//         try {
//           const parsed = JSON.parse(ev.data);
//           if (parsed.type === "reply") {
//             setReplyText(parsed.text || "");
//             // play audio if present
//             if (parsed.audio_b64) {
//               const audioBytes = base64ToArrayBuffer(parsed.audio_b64);
//               await playAudioBuffer(audioBytes);
//             }
//           } else if (parsed.type === "info") {
//             console.log("info:", parsed);
//           }
//         } catch (e) {
//           console.log("text message", ev.data);
//         }
//       } else {
//         // binary message (not expected in current design)
//         console.log("binary message received", ev.data);
//       }
//     };
//     wsRef.current = ws;
//   }

//   function base64ToArrayBuffer(base64) {
//     const binary_string = window.atob(base64);
//     const len = binary_string.length;
//     const bytes = new Uint8Array(len);
//     for (let i = 0; i < len; i++) {
//       bytes[i] = binary_string.charCodeAt(i);
//     }
//     return bytes.buffer;
//   }

//   async function playAudioBuffer(arrayBuffer) {
//     if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
//     const ctx = audioContextRef.current;
//     try {
//       const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
//       const src = ctx.createBufferSource();
//       src.buffer = decoded;
//       src.connect(ctx.destination);
//       src.start(0);
//     } catch (e) {
//       console.error("Audio decode/play failed", e);
//     }
//   }

//   async function startRecording() {
//     await connectWs();
//     if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
//       alert("WebSocket not connected");
//       return;
//     }

//     // Get mic
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     streamRef.current = stream;

//     // Create AudioContext at 16000 Hz to encourage resampling
//     const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
//     audioContextRef.current = new AudioContextCtor({ sampleRate: 16000 });
//     const ctx = audioContextRef.current;

//     // Create source and processor
//     const source = ctx.createMediaStreamSource(stream);
//     // Use ScriptProcessorNode for broad compatibility (AudioWorklet recommended in prod)
//     const bufferSize = 4096;
//     const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

//     processor.onaudioprocess = (e) => {
//       const inputData = e.inputBuffer.getChannelData(0); // Float32Array
//       const pcm16 = floatTo16BitPCM(inputData);
//       if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//         wsRef.current.send(pcm16);
//       }
//     };

//     source.connect(processor);
//     processor.connect(ctx.destination); // necessary on some browsers

//     processorRef.current = processor;
//     inputRef.current = source;
//     setRecording(true);
//   }

//   async function stopRecording() {
//     // send end signal so server will process the buffered bytes
//     if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
//       wsRef.current.send(JSON.stringify({ event: "end" }));
//     }

//     // stop audio processing
//     if (processorRef.current) {
//       try {
//         processorRef.current.disconnect();
//       } catch (e) {}
//       processorRef.current.onaudioprocess = null;
//       processorRef.current = null;
//     }
//     if (inputRef.current) {
//       try {
//         inputRef.current.disconnect();
//       } catch (e) {}
//       inputRef.current = null;
//     }
//     if (audioContextRef.current) {
//       try {
//         await audioContextRef.current.close();
//       } catch (e) {}
//       audioContextRef.current = null;
//     }
//     if (streamRef.current) {
//       streamRef.current.getTracks().forEach((t) => t.stop());
//       streamRef.current = null;
//     }
//     setRecording(false);
//   }

//   return (
//     <div style={{ padding: 24 }}>
//       <h2>Speech Streamer (frontend)</h2>
//       <div>
//         <button onClick={connectWs} disabled={connected}>
//           Connect WebSocket
//         </button>
//         <span style={{ marginLeft: 12 }}>
//           {connected ? "Connected" : "Disconnected"}
//         </span>
//       </div>

//       <div style={{ marginTop: 12 }}>
//         {!recording ? (
//           <button onClick={startRecording} disabled={!connected}>
//             Start
//           </button>
//         ) : (
//           <button onClick={stopRecording}>Stop</button>
//         )}
//       </div>

//       <div style={{ marginTop: 18 }}>
//         <strong>Assistant Reply:</strong>
//         <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{replyText}</div>
//       </div>
//     </div>
//   );
// }

// frontend/src/App.js
import React, { useState, useRef } from "react";

// Replace with your HF space ws URL or set REACT_APP_WS_URL in env
const WS_URL = process.env.REACT_APP_WS_URL || "wss://muzair-010-voice-assistant-backend.hf.space/ws";

/**
 * Real-time Voice Assistant frontend.
 * - Connect button opens the WebSocket without starting mic capture.
 * - Start begins microphone capture and streams PCM16 audio to WS.
 * - Stop stops mic capture and closes WS (which will return the full summary).
 * - You can Disconnect manually without stopping mic (Disconnect will also stop mic).
 */

export default function App() {
  // UI state
  const [connected, setConnected] = useState(false); // websocket connected
  const [recording, setRecording] = useState(false); // mic capture active
  const [messages, setMessages] = useState([]); // conversation log shown in UI
  const [statusMsg, setStatusMsg] = useState(""); // small status line for errors/info

  // Refs for long-lived objects
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  // Utility: convert Float32Array to linear16 PCM Buffer
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

  // Convert base64 string -> ArrayBuffer
  function base64ToArrayBuffer(base64) {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Play arrayBuffer audio using AudioContext
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

  // Connect WebSocket and setup handlers.
  // Returns a promise that resolves when the socket is open (or rejects on error).
  function connectWs() {
    return new Promise((resolve, reject) => {
      // If already connected, resolve immediately
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setStatusMsg("WebSocket already connected.");
        setConnected(true);
        return resolve();
      }

      try {
        const ws = new WebSocket(WS_URL);
        ws.binaryType = "arraybuffer";

        ws.onopen = () => {
          console.log("WS open");
          setConnected(true);
          setStatusMsg("WebSocket connected.");
          wsRef.current = ws;
          resolve();
        };

        ws.onclose = (ev) => {
          console.log("WS closed", ev);
          setConnected(false);
          setStatusMsg("WebSocket closed.");
          wsRef.current = null;
        };

        ws.onerror = (err) => {
          console.error("WS error", err);
          setStatusMsg("WebSocket error. See console.");
          setConnected(false);
          wsRef.current = null;
          reject(err);
        };

        ws.onmessage = async (ev) => {
          // handle JSON text messages (reply, audio_b64, summary, info)
          if (typeof ev.data === "string") {
            try {
              const parsed = JSON.parse(ev.data);
              if (parsed.type === "reply") {
                // Add AI reply text to conversation log
                setMessages((m) => [...m, { sender: "AI", text: parsed.text }]);

                // If audio_b64 present, play TTS
                if (parsed.audio_b64) {
                  const audioBuf = base64ToArrayBuffer(parsed.audio_b64);
                  await playAudioBuffer(audioBuf);
                }
              } else if (parsed.type === "summary") {
                // Replace conversation with summary (array of messages)
                if (Array.isArray(parsed.conversation)) {
                  const conv = parsed.conversation.map((item) => ({
                    sender: item.role === "assistant" ? "AI" : "User",
                    text: item.content,
                  }));
                  setMessages(conv);
                }
                setStatusMsg("Session summary received.");
              } else if (parsed.type === "info") {
                console.log("Info from server:", parsed);
                setStatusMsg(parsed.msg || "Info received.");
              } else {
                console.log("Unhandled message:", parsed);
              }
            } catch (e) {
              // Non-JSON text message
              console.log("Text message:", ev.data);
            }
          } else {
            // Binary messages are not used currently
            console.log("Binary message received:", ev.data);
          }
        };
      } catch (err) {
        console.error("WS connect exception:", err);
        reject(err);
      }
    });
  }

  // Disconnect WebSocket and cleanup audio resources
  function disconnectWs() {
    try {
      // Stop mic if recording
      if (recording) stopRecording();

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          console.warn("Error closing ws", e);
        }
        wsRef.current = null;
      }
      setConnected(false);
      setStatusMsg("Disconnected from server.");
    } catch (e) {
      console.error("disconnectWs err", e);
    }
  }

  // Start microphone capture and stream audio to WS
  async function startRecording() {
    setStatusMsg("");
    // ensure ws connected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      try {
        await connectWs();
      } catch (e) {
        return alert("Could not connect to server. Check console for details.");
      }
    }

    // Ask for mic access
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("getUserMedia failed:", err);
      setStatusMsg("Microphone permission denied or not available.");
      return;
    }

    streamRef.current = stream;

    // Create AudioContext with sampleRate ~16000 to help matching backend expectation
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContextRef.current = new AudioContextCtor({ sampleRate: 16000 });

    const ctx = audioContextRef.current;
    const source = ctx.createMediaStreamSource(stream);

    // ScriptProcessorNode for compatibility (AudioWorklet preferable for production)
    const bufferSize = 4096;
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1);

    processor.onaudioprocess = (e) => {
      try {
        const inputData = e.inputBuffer.getChannelData(0); // Float32Array
        const pcm16 = floatTo16BitPCM(inputData);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(pcm16);
        }
      } catch (err) {
        console.error("onaudioprocess error:", err);
      }
    };

    source.connect(processor);
    // Some browsers require connecting processor to destination to keep it alive
    processor.connect(ctx.destination);

    processorRef.current = processor;
    setRecording(true);
    setStatusMsg("Recording… (streaming audio)");
  }

  // Stop microphone capture; do NOT immediately clear messages — server will send summary after ws close
  async function stopRecording() {
    try {
      if (processorRef.current) {
        try {
          processorRef.current.disconnect();
        } catch (e) {}
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch (e) {}
        audioContextRef.current = null;
      }

      setRecording(false);
      setStatusMsg("Stopped recording.");

      // Close WS — server will send summary before fully closing if implemented
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.close();
        } catch (e) {
          console.warn("ws close error:", e);
        }
      }
      setConnected(false);
    } catch (err) {
      console.error("stopRecording error", err);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif" }}>
      <h2>🎤 Real-time Voice Assistant</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {/* Connect / Disconnect */}
        {!connected ? (
          <button
            onClick={async () => {
              setStatusMsg("Connecting...");
              try {
                await connectWs();
              } catch (e) {
                console.error(e);
                setStatusMsg("Failed to connect.");
              }
            }}
            style={{ padding: "8px 12px" }}
          >
            Connect
          </button>
        ) : (
          <button
            onClick={() => {
              disconnectWs();
            }}
            style={{ padding: "8px 12px" }}
          >
            Disconnect
          </button>
        )}

        {/* Start / Stop recording */}
        {!recording ? (
          <button onClick={startRecording} style={{ padding: "8px 12px" }} disabled={!connected && !!statusMsg && statusMsg.includes("Failed")}>
            Start
          </button>
        ) : (
          <button onClick={stopRecording} style={{ padding: "8px 12px" }}>
            Stop
          </button>
        )}

        {/* Connection status badge */}
        <div style={{ marginLeft: 12 }}>
          <strong>Status:</strong>{" "}
          <span style={{ color: connected ? "green" : "red", fontWeight: "bold" }}>
            {connected ? "Connected" : "Disconnected"}
          </span>
          {recording && <span style={{ marginLeft: 8, color: "orange", fontWeight: "bold" }}> • Recording</span>}
        </div>
      </div>

      {/* small status message */}
      <div style={{ marginBottom: 12, color: "#666" }}>{statusMsg}</div>

      {/* Conversation area */}
      <div style={{ marginTop: 4 }}>
        <strong>Conversation:</strong>
        <div
          style={{
            marginTop: 8,
            padding: 12,
            background: "#f7f7f7",
            borderRadius: 6,
            height: 340,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {messages.length === 0 ? (
            <div style={{ color: "#666" }}>No messages yet — speak after pressing Start.</div>
          ) : (
            messages.map((msg, idx) => (
              <div key={idx} style={{ marginBottom: 10 }}>
                <b style={{ color: msg.sender === "AI" ? "#1f6feb" : "#000" }}>{msg.sender}:</b>{" "}
                <span style={{ marginLeft: 6 }}>{msg.text}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
