// recorder.js — запись видео с canvas вместе со звуком через MediaRecorder.

export const canRecord = () =>
  typeof MediaRecorder !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  !!HTMLCanvasElement.prototype.captureStream;

const MIMES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

export function pickMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return MIMES.find(mime => {
    try { return MediaRecorder.isTypeSupported(mime); }
    catch (_) { return false; }
  }) || '';
}

export const extFor = mime => /mp4/i.test(mime || '') ? 'mp4' : 'webm';

// canvas — записываемый canvas; audioStream — MediaStream со звуком или null.
// Возвращает { mime, stop(): Promise<Blob> }.
export function startCanvasRecording(
  canvas,
  { fps = 60, bitrate = 8e6, audioStream = null } = {}
) {
  if (!canvas || typeof canvas.captureStream !== 'function') {
    throw new Error('Canvas captureStream не поддерживается');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder не поддерживается этим браузером');
  }

  const stream = canvas.captureStream(fps);
  const videoTracks = stream.getVideoTracks();

  if (!videoTracks.length) {
    stream.getTracks().forEach(track => {
      try { track.stop(); } catch (_) {}
    });
    throw new Error('Не удалось получить видеодорожку canvas');
  }

  // Добавляем только действующие аудиодорожки. Сам исходный audioStream
  // не останавливаем: он может использоваться проигрывателем кат-сцены.
  const audioTracks = audioStream && typeof audioStream.getAudioTracks === 'function'
    ? audioStream.getAudioTracks().filter(track => track.readyState === 'live')
    : [];

  for (const track of audioTracks) {
    try { stream.addTrack(track); }
    catch (error) { console.warn('[recorder] Не удалось добавить аудиодорожку:', error); }
  }

  const mime = pickMime();
  const options = { videoBitsPerSecond: bitrate };
  if (mime) options.mimeType = mime;
  if (audioTracks.length) options.audioBitsPerSecond = 192000;

  let recorder;
  try {
    recorder = new MediaRecorder(stream, options);
  } catch (error) {
    // Освобождаем только дорожки, созданные захватом canvas.
    videoTracks.forEach(track => {
      try { track.stop(); } catch (_) {}
    });
    throw error;
  }

  const chunks = [];
  const type = recorder.mimeType || mime || 'video/webm';

  const done = new Promise((resolve, reject) => {
    recorder.ondataavailable = event => {
      if (event.data && event.data.size) chunks.push(event.data);
    };

    recorder.onerror = event => {
      reject((event && event.error) || new Error('Ошибка записи видео'));
    };

    recorder.onstop = () => {
      // Финальный dataavailable приходит перед stop.
      resolve(new Blob(chunks, { type }));
    };
  });

  try {
    recorder.start(1000);
  } catch (error) {
    videoTracks.forEach(track => {
      try { track.stop(); } catch (_) {}
    });
    throw error;
  }

  let stopPromise = null;

  return {
    mime: type,

    stop() {
      if (stopPromise) return stopPromise;

      stopPromise = (async () => {
        try {
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          // Ждём onstop и финальный фрагмент, прежде чем выключать canvas track.
          return await done;
        } finally {
          videoTracks.forEach(track => {
            try { track.stop(); } catch (_) {}
          });
        }
      })();

      return stopPromise;
    }
  };
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
