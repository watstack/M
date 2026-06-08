(function () {
  'use strict';

  // ── Note frequencies (Hz) ─────────────────────────────────────────────────
  const N = {
    D2: 73.42, Eb2: 77.78, F2: 87.31, G2: 98.00, A2: 110.00,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, Eb4: 311.13, E4: 329.63, F4: 349.23,
    G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46,
    G5: 783.99, A5: 880.00,
  };

  // ── Theme data — 16 steps = 2 bars of 4/4 ────────────────────────────────
  const THEMES = {

    // Match of the Day feel — upbeat brass fanfare, C major, 126 BPM
    matchday: {
      bpm: 126,
      melodyType: 'square',   melodyGain: 0.12,
      bassType:   'square',   bassGain:   0.09,
      melody: [N.C5, 0,    N.E5, N.G5, N.E5, N.C5, 0,    N.G4,
               N.A4, N.C5, N.E5, 0,    N.D5, N.C5, 0,    0   ],
      bass:   [N.C3, 0,    N.G3, 0,    N.C3, 0,    N.G2, 0,
               N.A2, 0,    N.E3, 0,    N.G2, 0,    N.C3, 0   ],
      kick:   [1, 0, 0, 0,  1, 0, 0, 0,  1, 0, 0, 0,  1, 0, 0, 0],
      snare:  [0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 0],
      hat:    [1, 0, 1, 0,  1, 0, 1, 0,  1, 0, 1, 0,  1, 0, 1, 0],
    },

    // Zelda feel — peaceful pentatonic harp, G major pentatonic, 76 BPM
    zelda: {
      bpm: 76,
      melodyType: 'triangle', melodyGain: 0.15,
      bassType:   'triangle', bassGain:   0.10,
      melody: [N.G4, N.B4, N.D5, N.G5, N.D5, N.B4, N.G4, 0,
               N.A4, N.E5, N.A5, N.E5, N.A4, 0,    N.E4, 0  ],
      bass:   [N.G2, N.D3, N.G3, N.D3, N.G2, N.D3, N.G3, 0,
               N.A2, N.E3, N.A3, N.E3, N.A2, 0,    N.D3, 0  ],
      kick:   [1, 0, 0, 0,  0, 0, 1, 0,  1, 0, 0, 0,  0, 0, 1, 0],
      snare:  [0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0],
      hat:    [1, 0, 1, 0,  1, 0, 1, 0,  1, 0, 1, 0,  1, 0, 1, 0],
    },

    // Mortal Kombat feel — aggressive dark synth, D minor, 138 BPM
    mortal: {
      bpm: 138,
      melodyType: 'sawtooth', melodyGain: 0.10,
      bassType:   'sawtooth', bassGain:   0.11,
      melody: [N.D4,  0,     N.D4,  N.Eb4, N.D4, 0,    N.C4,  0,
               N.D4,  0,     N.Eb4, N.F4,  N.Eb4, 0,   N.D4,  N.C4 ],
      bass:   [N.D2,  0,     N.D2,  0,     N.Eb2, 0,   N.D2,  N.G2,
               N.D2,  0,     N.Eb2, 0,     N.F2,  0,   N.Eb2, N.D2 ],
      kick:   [1, 0, 0, 1,  0, 0, 1, 0,  1, 0, 0, 1,  0, 0, 1, 0],
      snare:  [0, 0, 0, 0,  1, 0, 0, 0,  0, 0, 0, 0,  1, 0, 0, 1],
      hat:    [1, 1, 1, 1,  1, 1, 1, 1,  1, 1, 1, 1,  1, 1, 1, 1],
    },
  };

  // ── Engine state ──────────────────────────────────────────────────────────
  let ctx          = null;
  let masterGain   = null;
  let _muted       = localStorage.getItem('kickoff_muted') === '1';
  let _theme       = null;
  let _pending     = null;
  let _step        = 0;
  let _nextTime    = 0;
  let _timerID     = null;
  let _gestured    = false;

  const LOOKAHEAD  = 25;   // ms between scheduler ticks
  const AHEAD      = 0.1;  // seconds to schedule ahead

  // ── Audio context ─────────────────────────────────────────────────────────
  function _init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = _muted ? 0 : 0.14;
    masterGain.connect(ctx.destination);
  }

  // ── Instrument voices ─────────────────────────────────────────────────────
  function _osc(freq, t, dur, type, gain) {
    if (!freq) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(gain, t);
    env.gain.setValueAtTime(gain * 0.65, t + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.9);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(t);
    osc.stop(t + dur);
  }

  function _kick(t) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  function _snare(t) {
    const len = Math.floor(ctx.sampleRate * 0.1);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'highpass'; flt.frequency.value = 1000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.28, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(flt); flt.connect(env); env.connect(masterGain);
    src.start(t); src.stop(t + 0.1);
  }

  function _hat(t, g) {
    const len = Math.floor(ctx.sampleRate * 0.04);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass'; flt.frequency.value = 8000; flt.Q.value = 10;
    const env = ctx.createGain();
    env.gain.setValueAtTime(g || 0.07, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.034);
    src.connect(flt); flt.connect(env); env.connect(masterGain);
    src.start(t); src.stop(t + 0.04);
  }

  // ── Scheduler ─────────────────────────────────────────────────────────────
  function _tick() {
    const th = THEMES[_theme];
    if (!th) return;
    const step = 60 / (th.bpm * 2); // 8th-note duration in seconds
    while (_nextTime < ctx.currentTime + AHEAD) {
      const i = _step % 16;
      _osc(th.melody[i], _nextTime, step * 0.84, th.melodyType, th.melodyGain);
      _osc(th.bass[i],   _nextTime, step * 0.70, th.bassType,   th.bassGain);
      if (th.kick[i])  _kick(_nextTime);
      if (th.snare[i]) _snare(_nextTime);
      if (th.hat[i])   _hat(_nextTime, _theme === 'mortal' ? 0.05 : 0.07);
      _nextTime += step;
      _step++;
    }
    _timerID = setTimeout(_tick, LOOKAHEAD);
  }

  function _start() {
    _step = 0;
    _nextTime = ctx.currentTime + 0.05;
    clearTimeout(_timerID);
    _tick();
  }

  // ── First user gesture unlocks AudioContext ───────────────────────────────
  function _gesture() {
    if (_gestured) return;
    _gestured = true;
    _init();
    (ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()).then(() => {
      if (_pending) { _theme = _pending; _pending = null; _start(); }
    });
    document.removeEventListener('click',      _gesture);
    document.removeEventListener('touchstart', _gesture);
    document.removeEventListener('keydown',    _gesture);
  }
  document.addEventListener('click',      _gesture, { passive: true });
  document.addEventListener('touchstart', _gesture, { passive: true });
  document.addEventListener('keydown',    _gesture, { passive: true });

  // ── Public API ─────────────────────────────────────────────────────────────
  window.Music = {
    play(name) {
      if (!THEMES[name]) return;
      if (_gestured && ctx) {
        if (_theme === name) return;
        _theme = name;
        clearTimeout(_timerID);
        _start();
      } else {
        _pending = name;
      }
    },
    stop() {
      clearTimeout(_timerID);
      _theme = null;
    },
    toggleMute() {
      _muted = !_muted;
      localStorage.setItem('kickoff_muted', _muted ? '1' : '0');
      if (masterGain) {
        masterGain.gain.setTargetAtTime(_muted ? 0 : 0.14, ctx.currentTime, 0.05);
      }
    },
    isMuted() { return _muted; },
  };

  // ── Mute button wiring ────────────────────────────────────────────────────
  function _wireBtn() {
    const btn = document.getElementById('muteBtn');
    if (!btn) return;
    const update = () => {
      btn.textContent = window.Music.isMuted() ? '🔇' : '🔊';
      btn.classList.toggle('muted', window.Music.isMuted());
    };
    btn.addEventListener('click', () => { window.Music.toggleMute(); update(); });
    update();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wireBtn);
  } else {
    _wireBtn();
  }

}());
