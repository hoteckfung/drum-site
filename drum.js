const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyQsZ4enf3nVL3ZR4OLdwnHbhY5qFVW41Huh2snBfNvqjQvigUuyOvxjsVHparq6-0kJA/exec';
const WAVES = ['sine', 'triangle', 'square', 'sawtooth'];
const FILTERS = ['lowpass', 'bandpass', 'highpass'];
const MAX_LAYERS = 4;
const DEFAULT_SOUNDS = {
  core: {
    layers: [
      { wave: 'sine', from: 150, to: 90, drop: 0.1, length: 0.75, volume: 0.65 },
      { wave: 'sine', from: 340, to: 230, drop: 0.1, length: 0.2, volume: 0.25 },
    ],
    noise: { filter: 'lowpass', frequency: 1200, q: 2, length: 0.03, volume: 0.3 },
  },
  rim: {
    layers: [{ wave: 'triangle', from: 1800, to: 1600, drop: 0.05, length: 0.08, volume: 0.5 }],
    noise: { filter: 'bandpass', frequency: 2500, q: 2, length: 0.06, volume: 2 },
  },
};

let sounds = cleanSounds(DEFAULT_SOUNDS);

async function loadSounds() {
  try {
    const response = await fetch(`${SCRIPT_URL}?sounds=1`);
    const saved = await response.json();
    if (saved && saved.core && saved.rim) {
      sounds = cleanSounds(saved);
    }
  } catch (error) {
    // Offline or the sheet is unreachable: the built-in sounds still play.
  }
  return sounds;
}

function coreSound(context, time, volume) {
  playSound(context, sounds.core, time, volume);
}

function rimSound(context, time, volume) {
  playSound(context, sounds.rim, time, volume);
}

function playSound(context, sound, time, volume) {
  for (const layer of sound.layers) {
    if (layer.volume > 0) {
      tone(context, time, layer.from, layer.to, layer.drop, layer.length, layer.volume * volume, layer.wave);
    }
  }
  if (sound.noise.volume > 0) {
    noiseBurst(context, time, sound.noise, sound.noise.volume * volume);
  }
}

function tone(context, time, startFrequency, endFrequency, drop, length, volume, wave) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(startFrequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + Math.min(drop, length));
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(volume, time + Math.min(0.003, length / 2));
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(time);
  oscillator.stop(time + length);
}

function noiseBurst(context, time, noise, volume) {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * noise.length), context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) {
    samples[index] = Math.random() * 2 - 1;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = noise.filter;
  filter.frequency.value = noise.frequency;
  filter.Q.value = noise.q;
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + noise.length);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(time);
}

function cleanSounds(input) {
  const source = input || {};
  return { core: cleanSound(source.core), rim: cleanSound(source.rim) };
}

function cleanSound(input) {
  const sound = input || {};
  const layers = Array.isArray(sound.layers) ? sound.layers.slice(0, MAX_LAYERS) : [];
  const noise = sound.noise || {};
  return {
    layers: layers.map((layer) => ({
      wave: WAVES.includes(layer.wave) ? layer.wave : 'sine',
      from: clamp(layer.from, 20, 8000),
      to: clamp(layer.to, 20, 8000),
      drop: clamp(layer.drop, 0.001, 1),
      length: clamp(layer.length, 0.005, 3),
      volume: clamp(layer.volume, 0, 1),
    })),
    noise: {
      filter: FILTERS.includes(noise.filter) ? noise.filter : 'lowpass',
      frequency: clamp(noise.frequency, 50, 12000),
      q: clamp(noise.q, 0.1, 30),
      length: clamp(noise.length, 0.001, 0.5),
      volume: clamp(noise.volume, 0, 10),
    },
  };
}

function clamp(value, low, high) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : low;
}
