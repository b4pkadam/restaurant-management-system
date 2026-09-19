import type { WaiterCallSound } from '../types';

class SoundService {
  private audioCtx: AudioContext | null = null;
  private isUnlocked = false;

  constructor() {
    this.initUnlockListeners();
  }

  /**
   * Listen for the first user interaction anywhere in the window
   * to unlock AudioContext according to modern browser autoplay policies.
   */
  private initUnlockListeners(): void {
    if (typeof window === 'undefined') return;

    const unlockHandler = () => {
      this.getAudioContext();
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().then(() => {
          this.isUnlocked = true;
        }).catch(() => {});
      } else if (this.audioCtx && this.audioCtx.state === 'running') {
        this.isUnlocked = true;
      }

      ['click', 'touchstart', 'pointerdown', 'keydown'].forEach((event) => {
        window.removeEventListener(event, unlockHandler, { capture: true });
      });
    };

    ['click', 'touchstart', 'pointerdown', 'keydown'].forEach((event) => {
      window.addEventListener(event, unlockHandler, { capture: true, passive: true });
    });
  }

  /**
   * Lazy-instantiate and return a single reusable AudioContext
   */
  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Trigger physical haptic vibration on supported devices
   */
  public vibrate(pattern: number[] = [300, 150, 300, 150, 500]): void {
    try {
      if (typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // Ignore vibration errors on unsupported platforms
    }
  }

  /**
   * Synthesize tone using Web Audio API
   */
  private playTone(
    ctx: AudioContext,
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'sine',
    peakGain = 0.4
  ): void {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + startOffset);
      gain.gain.linearRampToValueAtTime(peakGain, ctx.currentTime + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + startOffset);
      osc.stop(ctx.currentTime + startOffset + duration);
    } catch {
      // Audio synthesis error handling
    }
  }

  /**
   * Play specific waiter call sound pattern
   */
  public playTonePattern(sound: WaiterCallSound = 'chime'): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this.executeTonePattern(ctx, sound)).catch(() => {});
    } else {
      this.executeTonePattern(ctx, sound);
    }
  }

  private executeTonePattern(ctx: AudioContext, sound: WaiterCallSound): void {
    switch (sound) {
      case 'bell': {
        // Classic Restaurant Service Bell (Ding-Dong)
        // High crisp ding at 1760Hz with harmonic 2640Hz
        this.playTone(ctx, 1760, 0, 0.45, 'sine', 0.5);
        this.playTone(ctx, 2640, 0, 0.35, 'triangle', 0.25);
        // Rich warm resonance
        this.playTone(ctx, 1318.5, 0.22, 0.6, 'sine', 0.45);
        this.playTone(ctx, 1975.5, 0.22, 0.4, 'triangle', 0.2);
        break;
      }

      case 'urgent': {
        // Urgent Siren Alert (Rapid repeating high-pitch pulses)
        this.playTone(ctx, 988, 0, 0.12, 'square', 0.25);
        this.playTone(ctx, 1318.5, 0.14, 0.14, 'square', 0.3);
        this.playTone(ctx, 988, 0.32, 0.12, 'square', 0.25);
        this.playTone(ctx, 1318.5, 0.46, 0.18, 'square', 0.35);
        break;
      }

      case 'gentle': {
        // Gentle Warm Marimba Triad (Soft warm wooden chime)
        this.playTone(ctx, 523.25, 0, 0.3, 'triangle', 0.4);   // C5
        this.playTone(ctx, 659.25, 0.1, 0.3, 'triangle', 0.4);  // E5
        this.playTone(ctx, 783.99, 0.2, 0.3, 'triangle', 0.4);  // G5
        this.playTone(ctx, 1046.5, 0.3, 0.5, 'sine', 0.35);     // C6
        break;
      }

      case 'pager': {
        // Digital Pager (Classic wrist-pager beep)
        this.playTone(ctx, 2200, 0, 0.08, 'square', 0.3);
        this.playTone(ctx, 2200, 0.14, 0.08, 'square', 0.3);
        this.playTone(ctx, 2200, 0.28, 0.14, 'square', 0.35);
        break;
      }

      case 'chime':
      default: {
        // Harmonious 3-tone chime (G5 -> B5 -> E6)
        this.playTone(ctx, 784, 0, 0.25, 'sine', 0.4);       // G5
        this.playTone(ctx, 987.77, 0.18, 0.25, 'sine', 0.4); // B5
        this.playTone(ctx, 1318.5, 0.36, 0.55, 'sine', 0.45); // E6
        break;
      }
    }
  }

  /**
   * Main entrypoint to play sound and trigger vibration for waiter call
   */
  public playWaiterCallAlert(sound?: WaiterCallSound, enableVibration = true): void {
    this.playTonePattern(sound || 'chime');
    if (enableVibration !== false) {
      this.vibrate([300, 150, 300, 150, 500]);
    }
  }

  /**
   * Preview sound and vibration for admin settings
   */
  public testSound(sound: WaiterCallSound): void {
    this.playWaiterCallAlert(sound, true);
  }
}

export const soundService = new SoundService();
