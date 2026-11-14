// Web Audio API Sound Synthesizer for Outgoing and Incoming Quran Circle Calls
// Zero external dependencies, crystal-clear 48kHz synthesized soundscape

class CallAudioService {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private currentInterval: NodeJS.Timeout | null = null;
  private currentOscillators: OscillatorNode[] = [];

  private getAudioContext(): AudioContext | null {
    try {
      if (!this.ctx || this.ctx.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  // 1. Play Outgoing Ringback Tone (Traditional pleasant ringing: 440Hz + 480Hz pulses)
  public startOutgoingRingtone() {
    this.stop();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    this.isPlaying = true;

    const playTonePulse = () => {
      if (!this.isPlaying || !this.ctx || this.ctx.state === 'closed') return;
      try {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(480, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(this.ctx.currentTime);
        osc2.start(this.ctx.currentTime);
        osc1.stop(this.ctx.currentTime + 1.45);
        osc2.stop(this.ctx.currentTime + 1.45);

        this.currentOscillators.push(osc1, osc2);
      } catch {}
    };

    // Play immediately, then every 3 seconds (1.4s sound, 1.6s pause)
    playTonePulse();
    this.currentInterval = setInterval(playTonePulse, 3000);
  }

  // 2. Play Incoming Call Ring Chime (Gentle Islamic/pleasant pentatonic arpeggio)
  public startIncomingRingtone() {
    this.stop();
    const ctx = this.getAudioContext();
    if (!ctx) return;

    this.isPlaying = true;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Bright and clear)

    const playMelody = () => {
      if (!this.isPlaying || !this.ctx || this.ctx.state === 'closed') return;
      try {
        notes.forEach((freq, idx) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.16);

          const startTime = this.ctx.currentTime + idx * 0.16;
          gain.gain.setValueAtTime(0.001, startTime);
          gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(startTime);
          osc.stop(startTime + 0.48);
          this.currentOscillators.push(osc);
        });
      } catch {}
    };

    playMelody();
    this.currentInterval = setInterval(playMelody, 2400);
  }

  // 3. Play Member Joined Confirmation Chime (Pleasant upward chime)
  public playMemberJoinedChime() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18); // A5

      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.38);
    } catch {}
  }

  // 4. Play Call Rejected / Declined Sound (Double low tone)
  public playCallDeclinedSound() {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      [0, 0.18].forEach((delay) => {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, this.ctx.currentTime + delay);

        const startTime = this.ctx.currentTime + delay;
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.15, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.16);
      });
    } catch {}
  }

  // Stop all active ringtones immediately
  public stop() {
    this.isPlaying = false;
    if (this.currentInterval) {
      clearInterval(this.currentInterval);
      this.currentInterval = null;
    }
    this.currentOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.currentOscillators = [];
  }
}

export const ringtoneAudio = new CallAudioService();
