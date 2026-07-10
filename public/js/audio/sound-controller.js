const SOUND_PROFILES = {
  ak47: { volume: 0.72, duration: 0.18, bodyHz: 116, crackHz: 1650, noise: 0.14 },
  shotgun: { volume: 0.98, duration: 0.34, bodyHz: 62, crackHz: 760, noise: 0.3 },
  sniper: { volume: 0.9, duration: 0.42, bodyHz: 78, crackHz: 1120, noise: 0.25 }
};

export function createSoundController(ctx) {
  let audioContext = null;
  let master = null;
  let noiseBuffer = null;

  function ensureContext() {
    if (audioContext) {
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      return audioContext;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    audioContext = new AudioContext();
    master = audioContext.createGain();
    master.gain.value = 0.82;
    master.connect(audioContext.destination);
    return audioContext;
  }

  function getNoiseBuffer() {
    const audio = ensureContext();
    if (!audio) return null;
    if (noiseBuffer) return noiseBuffer;
    const length = Math.ceil(audio.sampleRate * 1.2);
    noiseBuffer = audio.createBuffer(1, length, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      last = last * 0.82 + (Math.random() * 2 - 1) * 0.18;
      data[i] = last;
    }
    return noiseBuffer;
  }

  function spatialOutput(position, volume, maxDistance = 55) {
    const audio = ensureContext();
    if (!audio || !master) return null;
    const gain = audio.createGain();
    gain.gain.value = volume;
    if (!position) {
      gain.connect(master);
      return gain;
    }
    const panner = audio.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.8;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.35;
    panner.positionX.value = Number(position.x) || 0;
    panner.positionY.value = Number(position.y) || 0;
    panner.positionZ.value = Number(position.z) || 0;
    panner.connect(gain);
    gain.connect(master);
    return panner;
  }

  function playShot(weapon, position = null, remote = false) {
    const audio = ensureContext();
    const profile = SOUND_PROFILES[weapon];
    if (!audio || !profile) return;
    const now = audio.currentTime;
    const output = spatialOutput(position, profile.volume * (remote ? 0.86 : 1), weapon === "sniper" ? 95 : 65);
    if (!output) return;

    const body = audio.createOscillator();
    const bodyGain = audio.createGain();
    body.type = "sawtooth";
    body.frequency.setValueAtTime(profile.bodyHz * (0.96 + Math.random() * 0.08), now);
    body.frequency.exponentialRampToValueAtTime(Math.max(24, profile.bodyHz * 0.38), now + profile.duration);
    bodyGain.gain.setValueAtTime(0.5, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + profile.duration);
    body.connect(bodyGain).connect(output);
    body.start(now);
    body.stop(now + profile.duration);

    const crack = audio.createOscillator();
    const crackGain = audio.createGain();
    crack.type = "square";
    crack.frequency.setValueAtTime(profile.crackHz * (0.9 + Math.random() * 0.2), now);
    crack.frequency.exponentialRampToValueAtTime(110, now + 0.075);
    crackGain.gain.setValueAtTime(0.13, now);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    crack.connect(crackGain).connect(output);
    crack.start(now);
    crack.stop(now + 0.09);

    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const noiseGain = audio.createGain();
    noise.buffer = getNoiseBuffer();
    filter.type = "bandpass";
    filter.frequency.value = weapon === "shotgun" ? 740 : 1400;
    filter.Q.value = 0.75;
    noiseGain.gain.setValueAtTime(profile.noise, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(0.18, profile.duration));
    noise.connect(filter).connect(noiseGain).connect(output);
    noise.start(now);
    noise.stop(now + Math.min(0.2, profile.duration));
  }

  function playReload(weapon) {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime;
    const output = spatialOutput(null, weapon === "shotgun" ? 0.42 : 0.34);
    if (!output) return;
    const offsets = weapon === "shotgun" ? [0, 0.31, 0.62] : [0, 0.18, 0.52];
    offsets.forEach((offset, index) => {
      const click = audio.createOscillator();
      const clickGain = audio.createGain();
      const t = now + offset;
      click.type = index === offsets.length - 1 ? "square" : "triangle";
      click.frequency.setValueAtTime(680 + index * 220, t);
      click.frequency.exponentialRampToValueAtTime(130, t + 0.075);
      clickGain.gain.setValueAtTime(index === offsets.length - 1 ? 0.22 : 0.12, t);
      clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      click.connect(clickGain).connect(output);
      click.start(t);
      click.stop(t + 0.1);
    });
  }

  function playExplosion(position) {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime;
    const output = spatialOutput(position, 1, 115);
    if (!output) return;
    const boom = audio.createOscillator();
    const boomGain = audio.createGain();
    boom.type = "sine";
    boom.frequency.setValueAtTime(88, now);
    boom.frequency.exponentialRampToValueAtTime(26, now + 0.72);
    boomGain.gain.setValueAtTime(0.92, now);
    boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
    boom.connect(boomGain).connect(output);
    boom.start(now);
    boom.stop(now + 0.8);

    const blast = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const blastGain = audio.createGain();
    blast.buffer = getNoiseBuffer();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.9);
    blastGain.gain.setValueAtTime(0.78, now);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    blast.connect(filter).connect(blastGain).connect(output);
    blast.start(now);
    blast.stop(now + 1);
  }

  function updateListener() {
    if (!audioContext || audioContext.state !== "running") return;
    const { camera } = ctx;
    const listener = audioContext.listener;
    const position = camera.getWorldPosition(ctx.soundListenerPosition);
    const forward = camera.getWorldDirection(ctx.soundListenerForward);
    listener.positionX.value = position.x;
    listener.positionY.value = position.y;
    listener.positionZ.value = position.z;
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
    listener.upX.value = camera.up.x;
    listener.upY.value = camera.up.y;
    listener.upZ.value = camera.up.z;
  }

  return { playExplosion, playReload, playShot, updateListener };
}
