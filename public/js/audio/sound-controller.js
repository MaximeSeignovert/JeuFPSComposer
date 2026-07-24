const SOUND_PROFILES = {
  ak47: {
    volume: 0.82,
    duration: 0.16,
    lowHz: 86,
    blastLowHz: 180,
    blastHighHz: 5600,
    crackHz: 3200,
    tail: 0.22,
    tailGain: 0.2,
    actionDelay: 0.036,
    actionHz: 1480,
    maxDistance: 82
  },
  shotgun: {
    volume: 0.98,
    duration: 0.34,
    lowHz: 52,
    blastLowHz: 82,
    blastHighHz: 3100,
    crackHz: 1450,
    tail: 0.56,
    tailGain: 0.4,
    actionDelay: 0.2,
    actionHz: 640,
    maxDistance: 115
  },
  sniper: {
    volume: 0.94,
    duration: 0.3,
    lowHz: 68,
    blastLowHz: 130,
    blastHighHz: 7200,
    crackHz: 4700,
    tail: 0.92,
    tailGain: 0.5,
    actionDelay: 0.09,
    actionHz: 1120,
    maxDistance: 175
  }
};

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createImpulseResponse(audio, duration = 1.35) {
  const length = Math.ceil(audio.sampleRate * duration);
  const impulse = audio.createBuffer(2, length, audio.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const time = i / audio.sampleRate;
      const decay = Math.pow(1 - i / length, 2.75);
      const earlyReflection =
        (time > 0.032 && time < 0.038) ||
        (time > 0.071 && time < 0.077) ||
        (time > 0.124 && time < 0.13)
          ? 1.65
          : 1;
      data[i] = (Math.random() * 2 - 1) * decay * earlyReflection * 0.42;
    }
  }

  return impulse;
}

function createNoiseBuffer(audio, color = "white", duration = 2) {
  const length = Math.ceil(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  let pink0 = 0;
  let pink1 = 0;
  let pink2 = 0;

  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    if (color === "brown") {
      brown = brown * 0.985 + white * 0.055;
      data[i] = brown * 2.4;
      continue;
    }
    if (color === "pink") {
      pink0 = 0.99765 * pink0 + white * 0.099046;
      pink1 = 0.963 * pink1 + white * 0.2965164;
      pink2 = 0.57 * pink2 + white * 1.0526913;
      data[i] = (pink0 + pink1 + pink2 + white * 0.1848) * 0.18;
      continue;
    }
    data[i] = white;
  }

  return buffer;
}

export function createSoundController(ctx) {
  let audioContext = null;
  let master = null;
  let compressor = null;
  let reverbInput = null;
  const noiseBuffers = {};

  function ensureContext() {
    if (audioContext) {
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      return audioContext;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();

    compressor = audioContext.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 5.5;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.18;

    master = audioContext.createGain();
    master.gain.value = 0.74;
    compressor.connect(master).connect(audioContext.destination);

    const reverb = audioContext.createConvolver();
    const reverbTone = audioContext.createBiquadFilter();
    const reverbGain = audioContext.createGain();
    reverb.buffer = createImpulseResponse(audioContext);
    reverbTone.type = "lowpass";
    reverbTone.frequency.value = 4200;
    reverbGain.gain.value = 0.34;
    reverbInput = audioContext.createGain();
    reverbInput.connect(reverb).connect(reverbTone).connect(reverbGain).connect(compressor);

    return audioContext;
  }

  function getNoiseBuffer(color = "white") {
    const audio = ensureContext();
    if (!audio) return null;
    if (!noiseBuffers[color]) noiseBuffers[color] = createNoiseBuffer(audio, color);
    return noiseBuffers[color];
  }

  function spatialOutput(position, volume, maxDistance = 70, tailAmount = 0.25, remote = false) {
    const audio = ensureContext();
    if (!audio || !compressor || !reverbInput) return null;

    const input = audio.createGain();
    const tone = audio.createBiquadFilter();
    const dryGain = audio.createGain();
    const tailSend = audio.createGain();
    input.gain.value = volume;
    tone.type = "lowpass";
    tone.frequency.value = remote ? 9800 : 15800;
    dryGain.gain.value = 1;
    tailSend.gain.value = tailAmount;

    if (position) {
      const panner = audio.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1.8;
      panner.maxDistance = maxDistance;
      panner.rolloffFactor = 1.18;
      panner.positionX.value = Number(position.x) || 0;
      panner.positionY.value = Number(position.y) || 0;
      panner.positionZ.value = Number(position.z) || 0;
      input.connect(panner).connect(tone);
    } else {
      input.connect(tone);
    }

    tone.connect(dryGain).connect(compressor);
    tone.connect(tailSend).connect(reverbInput);
    return input;
  }

  function playFilteredNoise({
    audio,
    output,
    color = "white",
    start,
    duration,
    peak,
    attack = 0.0015,
    highpass = 60,
    lowpass = 12000,
    endLowpass = null
  }) {
    const source = audio.createBufferSource();
    const highFilter = audio.createBiquadFilter();
    const lowFilter = audio.createBiquadFilter();
    const gain = audio.createGain();
    const buffer = getNoiseBuffer(color);
    if (!buffer) return;

    source.buffer = buffer;
    highFilter.type = "highpass";
    highFilter.frequency.value = highpass;
    lowFilter.type = "lowpass";
    lowFilter.frequency.setValueAtTime(lowpass, start);
    if (endLowpass) {
      lowFilter.frequency.exponentialRampToValueAtTime(Math.max(80, endLowpass), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(highFilter).connect(lowFilter).connect(gain).connect(output);

    const maxOffset = Math.max(0, buffer.duration - duration - 0.02);
    source.start(start, Math.random() * maxOffset);
    source.stop(start + duration + 0.025);
  }

  function playLowPunch(audio, output, start, profile) {
    const body = audio.createOscillator();
    const bodyGain = audio.createGain();
    body.type = "sine";
    body.frequency.setValueAtTime(profile.lowHz * randomBetween(1.22, 1.34), start);
    body.frequency.exponentialRampToValueAtTime(
      Math.max(24, profile.lowHz * 0.46),
      start + profile.duration * 0.82
    );
    bodyGain.gain.setValueAtTime(0.0001, start);
    bodyGain.gain.exponentialRampToValueAtTime(profile === SOUND_PROFILES.shotgun ? 0.86 : 0.62, start + 0.0025);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + profile.duration);
    body.connect(bodyGain).connect(output);
    body.start(start);
    body.stop(start + profile.duration + 0.02);
  }

  function playMechanicalClick(audio, output, start, frequency, strength = 1) {
    playFilteredNoise({
      audio,
      output,
      start,
      duration: 0.045,
      peak: 0.19 * strength,
      highpass: Math.max(260, frequency * 0.45),
      lowpass: Math.min(9200, frequency * 4.2)
    });

    const metal = audio.createOscillator();
    const metalGain = audio.createGain();
    metal.type = "triangle";
    metal.frequency.setValueAtTime(frequency * randomBetween(0.92, 1.08), start);
    metal.frequency.exponentialRampToValueAtTime(Math.max(170, frequency * 0.28), start + 0.042);
    metalGain.gain.setValueAtTime(0.11 * strength, start);
    metalGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
    metal.connect(metalGain).connect(output);
    metal.start(start);
    metal.stop(start + 0.055);
  }

  function playFirearmShot(weapon, position, remote) {
    const audio = ensureContext();
    const profile = SOUND_PROFILES[weapon];
    if (!audio || !profile) return;

    const now = audio.currentTime + 0.002;
    const output = spatialOutput(
      position,
      profile.volume * (remote ? 0.83 : 1),
      profile.maxDistance,
      profile.tailGain,
      remote
    );
    if (!output) return;

    playLowPunch(audio, output, now, profile);
    playFilteredNoise({
      audio,
      output,
      color: weapon === "shotgun" ? "brown" : "pink",
      start: now,
      duration: profile.duration,
      peak: weapon === "shotgun" ? 1 : 0.82,
      highpass: profile.blastLowHz,
      lowpass: profile.blastHighHz,
      endLowpass: Math.max(240, profile.blastHighHz * 0.16)
    });
    playFilteredNoise({
      audio,
      output,
      start: now,
      duration: weapon === "sniper" ? 0.026 : 0.018,
      peak: weapon === "sniper" ? 0.95 : 0.68,
      attack: 0.0007,
      highpass: profile.crackHz,
      lowpass: 15000
    });
    playFilteredNoise({
      audio,
      output,
      color: "pink",
      start: now + 0.018,
      duration: profile.tail,
      peak: weapon === "shotgun" ? 0.28 : 0.18,
      attack: 0.008,
      highpass: 95,
      lowpass: weapon === "sniper" ? 5100 : 3300,
      endLowpass: 280
    });

    const actionStrength = weapon === "shotgun" ? 1.45 : weapon === "sniper" ? 0.78 : 0.7;
    playMechanicalClick(audio, output, now + profile.actionDelay, profile.actionHz, actionStrength);
    if (weapon === "shotgun") {
      playMechanicalClick(audio, output, now + profile.actionDelay + 0.072, 980, 1.12);
    }
  }

  function playKnifeSwing(position = null, remote = false) {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime + 0.002;
    const output = spatialOutput(position, remote ? 0.42 : 0.58, 22, 0.08, remote);
    if (!output) return;

    const source = audio.createBufferSource();
    const band = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = getNoiseBuffer("white");
    band.type = "bandpass";
    band.Q.value = 0.72;
    band.frequency.setValueAtTime(2800, now);
    band.frequency.exponentialRampToValueAtTime(620, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.38, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    source.connect(band).connect(gain).connect(output);
    source.start(now, Math.random() * 1.6);
    source.stop(now + 0.22);

    const edge = audio.createOscillator();
    const edgeGain = audio.createGain();
    edge.type = "triangle";
    edge.frequency.setValueAtTime(randomBetween(2400, 2850), now + 0.018);
    edge.frequency.exponentialRampToValueAtTime(720, now + 0.12);
    edgeGain.gain.setValueAtTime(0.035, now + 0.018);
    edgeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    edge.connect(edgeGain).connect(output);
    edge.start(now + 0.018);
    edge.stop(now + 0.14);
  }

  function playShot(weapon, position = null, remote = false) {
    if (weapon === "knife") {
      playKnifeSwing(position, remote);
      return;
    }
    playFirearmShot(weapon, position, remote);
  }

  function playReload(weapon) {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime + 0.002;
    const output = spatialOutput(null, weapon === "shotgun" ? 0.5 : 0.42, 8, 0.06, false);
    if (!output) return;

    const sequences = {
      ak47: [
        [0, 520, 0.75],
        [0.2, 310, 1.15],
        [0.58, 420, 1],
        [0.78, 1720, 1.2]
      ],
      shotgun: [
        [0, 620, 0.85],
        [0.34, 760, 1],
        [0.68, 920, 1.1]
      ],
      sniper: [
        [0, 1180, 0.85],
        [0.38, 520, 0.95],
        [0.82, 1420, 1.1]
      ]
    };
    const sequence = sequences[weapon] || sequences.ak47;
    sequence.forEach(([offset, frequency, strength]) => {
      playMechanicalClick(audio, output, now + offset, frequency, strength);
    });
  }

  function playExplosion(position) {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime + 0.002;
    const output = spatialOutput(position, 1, 125, 0.72, Boolean(position));
    if (!output) return;

    const boomProfile = { lowHz: 48, duration: 0.78 };
    playLowPunch(audio, output, now, boomProfile);
    playFilteredNoise({
      audio,
      output,
      color: "brown",
      start: now,
      duration: 0.96,
      peak: 1,
      highpass: 38,
      lowpass: 2600,
      endLowpass: 105
    });
    playFilteredNoise({
      audio,
      output,
      start: now,
      duration: 0.055,
      peak: 0.72,
      highpass: 1700,
      lowpass: 12500
    });
  }

  function updateListener() {
    if (!audioContext || audioContext.state !== "running") return;
    const { camera } = ctx;
    const listener = audioContext.listener;
    const position = camera.getWorldPosition(ctx.soundListenerPosition);
    const forward = camera.getWorldDirection(ctx.soundListenerForward);

    if (listener.positionX) {
      listener.positionX.value = position.x;
      listener.positionY.value = position.y;
      listener.positionZ.value = position.z;
      listener.forwardX.value = forward.x;
      listener.forwardY.value = forward.y;
      listener.forwardZ.value = forward.z;
      listener.upX.value = camera.up.x;
      listener.upY.value = camera.up.y;
      listener.upZ.value = camera.up.z;
      return;
    }

    listener.setPosition(position.x, position.y, position.z);
    listener.setOrientation(forward.x, forward.y, forward.z, camera.up.x, camera.up.y, camera.up.z);
  }

  return { playExplosion, playReload, playShot, updateListener };
}
