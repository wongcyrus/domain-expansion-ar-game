const winVideos = [
  'heroacademy.mp4', 'solo-leveling.mp4', 'onepunchman.mp4', '8-gate.mp4', 'escanor.mp4',
  'onepunch.mp4', 'onepunch2.mp4', 'demon-slayer-s2.mp4', 'demon-slayer-s1.mp4'
];
const loseVideos = Array.from({ length: 9 }, (_, index) => `shiba${index + 1}.mp4`);

export function selectResultVideo(won: boolean, previous?: string): string {
  const category = won ? 'win' : 'lose';
  const choices = (won ? winVideos : loseVideos)
    .map((filename) => `/static/video/${category}/${filename}`)
    .filter((src) => src !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}
