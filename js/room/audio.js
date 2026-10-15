// A tiny lofi radio made with the Web Audio API: no audio files to download.
// Jazzy 7th chords, a lazy swung beat, vinyl crackle and rain.

const BPM = 72;
const STEP = 60 / BPM / 4; // a 16th note
const SWING = 0.12; // push every second 16th a little late

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Fmaj7 · Em7 · Dm7 · Cmaj7 (+ a Bb69 flavour for the turnaround)
const CHORDS = [
    [53, 57, 60, 64, 67],
    [52, 55, 59, 62, 66],
    [50, 53, 57, 60, 64],
    [48, 52, 55, 59, 62],
    [53, 57, 60, 64, 69],
    [52, 55, 59, 62, 67],
    [50, 53, 57, 60, 65],
    [46, 50, 53, 57, 62],
];
const SCALE = [72, 74, 76, 79, 81, 84]; // C major pentatonic for the little melody

// 16 steps per bar
const KICK = [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const HAT = [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0];

export class LofiRadio {
    constructor() {
        this.ctx = null;
        this.playing = false;
        this.step = 0;
        this.bar = 0;
        this.nextTime = 0;
        this.timer = null;
    }

    init() {
        if (this.ctx) return;
        const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());

        this.master = ctx.createGain();
        this.master.gain.value = 0;

        // the "muffled tape" sound
        this.tone = ctx.createBiquadFilter();
        this.tone.type = "lowpass";
        this.tone.frequency.value = 2400;
        this.tone.Q.value = 0.4;

        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 3;

        this.tone.connect(comp).connect(this.master).connect(ctx.destination);

        this.noise = this.makeNoise();
        this.startCrackle();
        this.startRain();
    }

    makeNoise() {
        const ctx = this.ctx;
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    startCrackle() {
        const ctx = this.ctx;
        const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            d[i] = (Math.random() * 2 - 1) * 0.012;
            if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 0.6;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 1500;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        src.connect(hp).connect(g).connect(this.master);
        src.start();
    }

    startRain() {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = "lowpass";
        bp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        src.connect(bp).connect(g).connect(this.master);
        src.start();
    }

    keys(note, t, dur, vel) {
        const ctx = this.ctx;
        const f = midi(note);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel, t + 0.03);
        g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        g.connect(this.tone);
        const wow = Math.sin(t * 0.9) * 8; // slow tape wobble, in cents
        for (const [type, detune, level] of [["sine", 0, 1], ["triangle", 4, 0.35]]) {
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.value = f;
            o.detune.value = detune + wow;
            const lg = ctx.createGain();
            lg.gain.value = level;
            o.connect(lg).connect(g);
            o.start(t);
            o.stop(t + dur + 0.05);
        }
    }

    bass(note, t, dur) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = midi(note - 12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.32, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.tone);
        o.start(t);
        o.stop(t + dur + 0.05);
    }

    kick(t) {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(120, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.75, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(this.tone);
        o.start(t);
        o.stop(t + 0.4);
    }

    hit(t, { freq, q, level, decay, type = "bandpass" }) {
        const ctx = this.ctx;
        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(level, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        src.connect(f).connect(g).connect(this.tone);
        src.start(t, Math.random());
        src.stop(t + decay + 0.05);
    }

    schedule(step, t) {
        const chord = CHORDS[this.bar % CHORDS.length];
        const barLen = STEP * 16;

        if (step === 0) {
            chord.forEach((n, i) => this.keys(n, t + i * 0.012, barLen * 0.95, 0.07));
            this.bass(chord[0], t, STEP * 7);
        }
        if (step === 10) this.bass(chord[0], t, STEP * 5);
        if (step === 8 && this.bar % 2) chord.slice(1, 4).forEach((n) => this.keys(n + 12, t, STEP * 6, 0.025));

        if (KICK[step]) this.kick(t);
        if (SNARE[step]) this.hit(t + 0.012, { freq: 1800, q: 0.7, level: 0.32, decay: 0.18 });
        if (HAT[step]) this.hit(t, { freq: 8000, q: 1, level: step % 4 ? 0.05 : 0.09, decay: 0.05, type: "highpass" });

        // a few lazy melody notes
        if ((step === 2 || step === 6 || step === 11) && Math.random() < 0.38) {
            const n = SCALE[Math.floor(Math.random() * SCALE.length)];
            this.keys(n, t, STEP * 5, 0.045);
        }
    }

    tick() {
        const ctx = this.ctx;
        while (this.nextTime < ctx.currentTime + 0.15) {
            const swing = this.step % 2 ? SWING * STEP * 2 : 0;
            this.schedule(this.step, this.nextTime + swing);
            this.nextTime += STEP;
            this.step = (this.step + 1) % 16;
            if (this.step === 0) this.bar++;
        }
    }

    async play() {
        this.init();
        await this.ctx.resume();
        if (this.playing) return;
        this.playing = true;
        this.nextTime = this.ctx.currentTime + 0.1;
        this.step = 0;
        this.timer = setInterval(() => this.tick(), 25);
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.4);
    }

    stop() {
        if (!this.playing) return;
        this.playing = false;
        clearInterval(this.timer);
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    }

    toggle() {
        return this.playing ? (this.stop(), false) : (this.play(), true);
    }
}
