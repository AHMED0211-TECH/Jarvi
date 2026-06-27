"use client";

import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [status, setStatus] = useState<"idle" | "listening" | "processing" | "speaking">("idle");
  const [userTranscript, setUserTranscript] = useState<string>("");
  const [assistantResponse, setAssistantResponse] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    // Initialize Web Speech APIs in browser
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = true;
        rec.lang = "en-US";

        rec.onstart = () => {
          setStatus("listening");
          setUserTranscript("");
          setAssistantResponse("");
          setError(null);
        };

        rec.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          setUserTranscript(finalTranscript || interimTranscript);
        };

        rec.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          if (event.error === "not-allowed") {
            setError("Microphone permission denied. Please allow microphone access in your browser settings.");
          } else if (event.error === "no-speech") {
            setError("No speech was detected. Please try speaking again.");
          } else {
            setError(`Speech recognition error: ${event.error}`);
          }
          setStatus("idle");
        };

        rec.onend = () => {
          // If we are still in listening mode, check if we got speech to process
          setStatus((currentStatus) => {
            if (currentStatus === "listening") {
              return "processing";
            }
            return currentStatus;
          });
        };

        recognitionRef.current = rec;
      } else {
        setError("Your browser does not support built-in Speech Recognition. Please try Google Chrome, Microsoft Edge, or Safari.");
      }
      setMounted(true);
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  // Process text and speech response when status transitions to 'processing'
  useEffect(() => {
    if (status === "processing") {
      if (!userTranscript.trim()) {
        setStatus("idle");
        return;
      }

      // Start Assistant Response Speech Synthesis
      const getResponseAndSpeak = async () => {
        setStatus("speaking");
        let responsePhrase = "Sorry, I couldn't reach the servers.";

        try {
          const res = await fetch("http://localhost:8000/chat", {
            method: 'POST',
            headers: { "Content-type": "application/json" },
            body: JSON.stringify({ message: userTranscript }),
          });
          const data = await res.json()
          responsePhrase = data.response;
        } catch (e) {
          console.error("Backend resquest failed:", e);
          setError("could not reach the backend");
        }
        setAssistantResponse(responsePhrase);

        if (synthRef.current) {
          // Clear any ongoing speech
          synthRef.current.cancel();

          const utterance = new SpeechSynthesisUtterance(responsePhrase);

          utterance.onend = () => {
            setStatus("idle");
          };

          utterance.onerror = (event) => {
            console.error("Speech synthesis error:", event);
            setError("Speech synthesis failed.");
            setStatus("idle");
          };

          synthRef.current.speak(utterance);
        } else {
          setError("Speech synthesis is not supported or not ready in this browser.");
          setStatus("idle");
        }
      }
      getResponseAndSpeak();
    }
  }, [status, userTranscript]);

  const handleStartListening = () => {
    if (!recognitionRef.current) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      recognitionRef.current.start();
    } catch (e) {
      console.error("Error starting speech recognition:", e);
      try {
        recognitionRef.current.stop();
        recognitionRef.current.start();
      } catch (err) {
        setError("Failed to start recording. Please try restarting.");
      }
    }
  };

  const handleReset = () => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
    }
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setStatus("idle");
    setUserTranscript("");
    setAssistantResponse("");
    setError(null);
  };

  const isSupported = mounted && typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      <div className="bg-grid"></div>

      <main className="app-container">
        <div className="glass-card">
          <h1 className="app-title">EchoSpeech</h1>
          <p className="app-subtitle">Built-in Speech Recognition & Synthesis Loop</p>

          {error && (
            <div className="error-banner">
              <strong>Alert:</strong> {error}
            </div>
          )}

          <div className="status-container">
            <span className={`status-pill ${status}`}>
              <span className="status-indicator"></span>
              {status === "idle" && "Ready"}
              {status === "listening" && "Listening..."}
              {status === "processing" && "Processing..."}
              {status === "speaking" && "Speaking..."}
            </span>
          </div>

          <div className="mic-wrapper">
            <div className={`pulse-ring-container ${status === "listening" ? "listening" : ""} ${status === "speaking" ? "speaking" : ""}`}>
              <div className="pulse-ring pulse-ring-1"></div>
              <div className="pulse-ring pulse-ring-2"></div>
              <div className="pulse-ring pulse-ring-3"></div>
            </div>

            <button
              onClick={handleStartListening}
              disabled={!isSupported || status === "processing" || status === "speaking"}
              className="mic-button"
              aria-label="Start listening"
              id="speech-trigger-btn"
            >
              {status === "listening" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              ) : status === "speaking" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              )}
            </button>
          </div>

          {/* User speech transcript panel */}
          <div className={`text-panel ${status === "listening" ? "active" : ""}`}>
            <div className="panel-label">
              <span className={`label-dot user-dot ${status === "listening" ? "active" : ""}`}></span>
              You Said
            </div>
            <div className="panel-content">
              {userTranscript ? (
                userTranscript
              ) : (
                <span className="placeholder-text">
                  {status === "listening" ? "Listening to your voice..." : "Click the microphone and start speaking."}
                </span>
              )}
            </div>
          </div>

          {/* Assistant voice synthesis transcript panel */}
          <div className={`text-panel ${status === "speaking" ? "speaking" : ""}`}>
            <div className="panel-label">
              <span className={`label-dot assistant-dot ${status === "speaking" ? "active" : ""}`}></span>
              Echo Response
              {status === "speaking" && (
                <div className="waveform">
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                  <div className="wave-bar"></div>
                </div>
              )}
            </div>
            <div className="panel-content">
              {assistantResponse ? (
                assistantResponse
              ) : (
                <span className="placeholder-text">Assistant response will appear here.</span>
              )}
            </div>
          </div>

          <button
            onClick={handleReset}
            disabled={status === "idle" && !userTranscript && !assistantResponse}
            className="reset-btn"
            aria-label="Reset app state"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
            Reset
          </button>
        </div>
      </main>
    </>
  );
}
