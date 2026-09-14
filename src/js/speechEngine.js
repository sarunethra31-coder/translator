// Web Speech API - Speech Recognition (STT) & Multi-Language Speech Synthesis (TTS) Engine

class SpeechEngine {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.isListening = false;
    this.animationId = null;
    this.voices = [];
    this.currentAudio = null;
    
    // Default settings
    this.rate = 1.0;
    this.pitch = 1.0;

    this.initRecognition();
    this.loadVoices();
  }

  /**
   * Initialize Web Speech Recognition
   */
  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
    } else {
      console.warn("Web SpeechRecognition API is not supported in this browser.");
    }
  }

  /**
   * Load available browser voices
   */
  loadVoices() {
    if (!this.synthesis) return;
    
    const updateVoices = () => {
      this.voices = this.synthesis.getVoices() || [];
    };

    updateVoices();
    if (this.synthesis.onvoiceschanged !== undefined) {
      this.synthesis.onvoiceschanged = updateVoices;
    }
  }

  /**
   * Map language selection code to BCP-47 locale tag
   */
  getLangCode(lang) {
    const langMap = {
      'tanglish': 'ta-IN',
      'ta': 'ta-IN',
      'en': 'en-US',
      'hi': 'hi-IN',
      'te': 'te-IN',
      'ml': 'ml-IN',
      'kn': 'kn-IN',
      'es': 'es-ES',
      'fr': 'fr-FR',
      'de': 'de-DE',
      'ja': 'ja-JP',
      'zh': 'zh-CN',
      'ar': 'ar-SA',
      'ru': 'ru-RU',
      'ko': 'ko-KR',
      'it': 'it-IT'
    };

    return langMap[lang] || (lang && lang.includes('-') ? lang : `${lang}-${lang.toUpperCase()}`);
  }

  /**
   * Get StreamElements Public Voice Name for fallback audio
   */
  getStreamElementsVoice(lang) {
    const voiceMap = {
      'ta': 'Valluvar',
      'tanglish': 'Valluvar',
      'hi': 'Aditi',
      'te': 'Chitra',
      'ml': 'Malayalam',
      'kn': 'Kannada',
      'es': 'Conchita',
      'fr': 'Celine',
      'de': 'Marlene',
      'ja': 'Mizuki',
      'zh': 'Zhiyu',
      'ar': 'Zeina',
      'ru': 'Tatyana',
      'en': 'Brian'
    };

    return voiceMap[lang] || 'Brian';
  }

  /**
   * Start Microphone Recording
   */
  startListening(lang = 'en-US', onResult, onError, onEnd) {
    if (!this.recognition) {
      if (onError) onError("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

    this.recognition.lang = this.getLangCode(lang);

    this.recognition.onresult = (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (onResult) onResult(transcript, event.results[0].isFinal);
    };

    this.recognition.onerror = (event) => {
      console.error("Speech Recognition Error:", event.error);
      this.isListening = false;
      if (onError) onError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (onEnd) onEnd();
    };

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (e) {
      console.error("Error starting recognition:", e);
      if (onError) onError(e.message);
    }
  }

  /**
   * Stop Microphone Recording
   */
  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  /**
   * Speak Text via Multi-Layer Text-To-Speech (TTS)
   */
  speakText(text, lang = 'en', onStart, onEnd) {
    if (!text || !text.trim()) return;

    const cleanText = text.trim();
    const langCode = this.getLangCode(lang);
    const shortLang = langCode.split('-')[0].toLowerCase();

    // Stop any active audio element playback
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    // Unpause SpeechSynthesis if locked
    if (this.synthesis) {
      this.synthesis.cancel();
      if (this.synthesis.paused) {
        this.synthesis.resume();
      }
    }

    // Refresh voices if empty
    if (this.synthesis && this.voices.length === 0) {
      this.voices = this.synthesis.getVoices() || [];
    }

    // Check if browser has a native matching voice
    const nativeVoice = this.voices.find(v => {
      const vLang = v.lang.toLowerCase().replace('_', '-');
      return vLang.startsWith(shortLang) || vLang.includes(langCode.toLowerCase());
    });

    let spokeLocally = false;

    // 1. Try Browser SpeechSynthesis
    if (this.synthesis && 'SpeechSynthesisUtterance' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = langCode;
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;

        if (nativeVoice) {
          utterance.voice = nativeVoice;
        }

        let hasStarted = false;

        utterance.onstart = () => {
          hasStarted = true;
          spokeLocally = true;
          if (onStart) onStart();
        };

        utterance.onend = () => {
          if (onEnd) onEnd();
        };

        utterance.onerror = (err) => {
          console.warn("SpeechSynthesis utterance error:", err);
          if (!hasStarted) {
            this.playAudioStreamFallback(cleanText, lang, onStart, onEnd);
          } else if (onEnd) {
            onEnd();
          }
        };

        this.synthesis.speak(utterance);

        // Safeguard timer: if speech doesn't start in 600ms, use stream fallback
        setTimeout(() => {
          if (!hasStarted && (!this.synthesis.speaking || this.synthesis.paused)) {
            console.warn("SpeechSynthesis timeout, playing StreamElements fallback");
            this.synthesis.cancel();
            this.playAudioStreamFallback(cleanText, lang, onStart, onEnd);
          }
        }, 600);

        return;
      } catch (e) {
        console.warn("SpeechSynthesis exception:", e);
      }
    }

    // 2. Direct Fallback: High Quality StreamElements TTS Audio Stream
    this.playAudioStreamFallback(cleanText, lang, onStart, onEnd);
  }

  /**
   * Play High-Quality Multi-Language Audio Stream Fallback
   */
  playAudioStreamFallback(text, lang, onStart, onEnd) {
    if (this.synthesis) {
      this.synthesis.cancel();
    }

    const langCode = this.getLangCode(lang).split('-')[0];

    // 1. Google GTX TTS Endpoint (CORS-friendly, loud & crystal clear audio)
    const googleUrl = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${langCode}&q=${encodeURIComponent(text)}`;
    const audio = new Audio();
    this.currentAudio = audio;
    audio.crossOrigin = "anonymous";
    audio.src = googleUrl;

    if (onStart) audio.onplay = onStart;
    if (onEnd) {
      audio.onended = () => {
        this.currentAudio = null;
        onEnd();
      };
      audio.onerror = () => {
        console.warn("Google GTX TTS failed, trying StreamElements fallback");
        this.playStreamElementsFallback(text, lang, onStart, onEnd);
      };
    }

    audio.play().then(() => {
      if (onStart) onStart();
    }).catch(err => {
      console.warn("Google GTX TTS playback error, trying StreamElements fallback:", err);
      this.playStreamElementsFallback(text, lang, onStart, onEnd);
    });
  }

  /**
   * Secondary Fallback: StreamElements Voice API
   */
  playStreamElementsFallback(text, lang, onStart, onEnd) {
    const voiceName = this.getStreamElementsVoice(lang);
    const ttsUrl = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voiceName)}&text=${encodeURIComponent(text)}`;

    const audio = new Audio(ttsUrl);
    this.currentAudio = audio;

    if (onStart) audio.onplay = onStart;
    if (onEnd) {
      audio.onended = () => {
        this.currentAudio = null;
        onEnd();
      };
      audio.onerror = () => {
        this.currentAudio = null;
        if (onEnd) onEnd();
      };
    }

    audio.play().catch(e => {
      console.error("All TTS audio streams failed:", e);
      this.currentAudio = null;
      if (onEnd) onEnd();
    });
  }

  /**
   * Render Canvas Animated Waveform for Voice Input
   */
  startWaveformAnimation(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let step = 0;

    const draw = () => {
      if (!this.isListening) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const numBars = 30;
      const barWidth = 6;
      const gap = 4;
      const startX = (canvas.width - (numBars * (barWidth + gap))) / 2;

      for (let i = 0; i < numBars; i++) {
        const height = Math.sin(step + i * 0.3) * 20 + Math.random() * 25 + 5;
        const x = startX + i * (barWidth + gap);
        const y = (canvas.height - height) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, '#00f2fe');
        gradient.addColorStop(1, '#8a2be2');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, height, 3);
        ctx.fill();
      }

      step += 0.15;
      this.animationId = requestAnimationFrame(draw);
    };

    draw();
  }

  stopWaveformAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }
}

export const speechEngine = new SpeechEngine();
