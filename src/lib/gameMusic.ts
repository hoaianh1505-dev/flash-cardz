// Lightweight zero-dependency Web Audio Arcade / Synthwave BGM Engine
// Balanced low master gain so English TTS pronunciation always cuts through clearly.

export type BgmStyle = 'arcade' | 'boss';

class GameMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private step = 0;
  private running = false;
  private style: BgmStyle = 'arcade';

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.44;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 8;
      comp.ratio.value = 8;
      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playNote(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    detune = 0
  ) {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master || freq <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (detune) osc.detune.setValueAtTime(detune, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private playKick() {
    const ctx = this.ctx;
    const master = this.masterGain;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.11);
    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  private tick = () => {
    if (!this.running) return;
    const i = this.step % 16;
    this.step++;

    if (this.style === 'boss') {
      // Intense D-minor Boss theme (146 BPM 16th-note pulse)
      const bass = [73.42, 73.42, 87.31, 73.42, 65.41, 65.41, 82.41, 65.41, 58.27, 58.27, 73.42, 58.27, 65.41, 73.42, 82.41, 87.31];
      const lead = [293.66, 0, 349.23, 329.63, 293.66, 0, 440.0, 415.3, 392.0, 0, 349.23, 329.63, 293.66, 329.63, 349.23, 440.0];
      if (i % 4 === 0 || i === 14) this.playKick();
      this.playNote(bass[i], 0.12, 'sawtooth', 0.24);
      if (lead[i] > 0) this.playNote(lead[i], 0.16, 'square', 0.16, 4);
    } else {
      // Upbeat A-minor / C-major synthwave arcade groove (124 BPM)
      const bass = [110, 0, 110, 0, 87.31, 0, 87.31, 0, 130.81, 0, 130.81, 0, 98, 0, 123.47, 0];
      const arp = [440, 523.25, 659.25, 523.25, 349.23, 440, 523.25, 440, 523.25, 659.25, 783.99, 659.25, 392, 493.88, 587.33, 659.25];
      if (i % 4 === 0) this.playKick();
      if (bass[i] > 0) this.playNote(bass[i], 0.22, 'triangle', 0.32);
      if (i % 2 === 0 || i % 4 === 3) {
        this.playNote(arp[i], 0.17, 'triangle', 0.18, 3);
      }
    }
  };

  start(style: BgmStyle = 'arcade') {
    if (this.running && this.style === style) return;
    this.stop();
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.style = style;
    this.running = true;
    const stepMs = style === 'boss' ? 103 : 121;
    this.tick();
    this.timer = setInterval(this.tick, stepMs);
  }

  setStyle(style: BgmStyle) {
    if (!this.running || this.style === style) return;
    this.start(style);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const gameMusic = new GameMusicEngine();
