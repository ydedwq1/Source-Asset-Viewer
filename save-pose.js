// save-pose.js
// Сохранение одного кадра анимации Source Engine в JSON.
// Требует anim.js с экспортом samplePose().
//
// Пример:
// import { downloadPoseJSON } from './save-pose.js';
// downloadPoseJSON(seq, mainBones, 1.25, 'character-pose.json');

import { samplePose } from './anim.js';

/**
 * Сохраняет позу анимации в JSON.
 *
 * @param {object} seq       Последовательность из loadAnimations(...).seqs
 * @param {Array} mainBones Кости основной модели из parseAnimSet(...).bones
 * @param {number} time      Время в секундах от начала анимации
 * @param {string} filename Имя скачиваемого файла
 */
export function downloadPoseJSON(seq, mainBones, time, filename = 'character-pose.json') {
  if (!seq || !Array.isArray(mainBones)) {
    throw new Error('Нужна последовательность анимации и массив костей модели.');
  }

  const pose = samplePose(seq, mainBones.length, mainBones, time, seq.loop);

  const data = {
    format: 'source-engine-pose',
    version: 1,
    animation: seq.name,
    timeSeconds: time,
    frame: Math.max(0, Math.min(seq.numframes - 1, time * seq.fps)),
    fps: seq.fps,
    bones: mainBones.map((bone, i) => ({
      name: bone.name,
      parent: bone.parent,
      position: [
        pose.pos[i * 3],
        pose.pos[i * 3 + 1],
        pose.pos[i * 3 + 2]
      ],
      quaternion: [
        pose.quat[i * 4],
        pose.quat[i * 4 + 1],
        pose.quat[i * 4 + 2],
        pose.quat[i * 4 + 3]
      ]
    }))
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Даём браузеру начать скачивание перед освобождением URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
