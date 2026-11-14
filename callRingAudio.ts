/**
 * Realistic Call Ring Tone Generator via Web Audio API
 * Generates telephone ringback and incoming call ringer without any external MP3 dependencies.
 */

class RingTonePlayer {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private timer: NodeJS.Timeout | null = null;

  private getAudioContext(): AudioContext | null {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.ctx || this.ctx.state === 'closed') {
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

  /**
   * Outgoing Ringback: Standard PBX ring (440Hz + 480Hz dual tone)
   * 1.5s tone, 2.5s silence cycle. Used for caller while waiting for others to answer.
   */
  public startOutgoing(): () => void {
    this.stop();
    this.isPlaying = true;

    const playPulse = () => {
      if (!this.isPlaying) return;
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 1.4);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.55);
      osc2.stop(now + 1.55);

      this.timer = setTimeout(() => {
        if (this.isPlaying) playPulse();
      }, 3500);
    };

    playPulse();

    return () => this.stop();
  }

  /**
   * Incoming Ringtone: WhatsApp / Discord style cheerful dual-burst tone
   * Plays a distinct pattern to notify recipients of an incoming call.
   */
  public startIncoming(): () => void {
    this.stop();
    this.isPlaying = true;

    const notes = [
      { f: 523.25, start: 0, dur: 0.15 },     // C5
      { f: 659.25, start: 0.18, dur: 0.15 },  // E5
      { f: 783.99, start: 0.36, dur: 0.22 },  // G5
      { f: 1046.50, start: 0.62, dur: 0.35 }  // C6
    ];

    const playChime = () => {
      if (!this.isPlaying) return;
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      notes.forEach(({ f, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + start);

        gain.gain.setValueAtTime(0, now + start);
        gain.gain.linearRampToValueAtTime(0.12, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + dur + 0.05);
      });

      this.timer = setTimeout(() => {
        if (this.isPlaying) playChime();
      }, 2400);
    };

    playChime();

    return () => this.stop();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const ringPlayer = new RingTonePlayer();
