// Fourteen independent electrodes: gaps belong to each stroke junction,
// rather than a mask cutting through an otherwise continuous typeface.
const strokes: Record<string, [number, number, number, number]> = {
  a: [3.2, 2, 16.8, 2], b: [18, 3.2, 18, 14], c: [18, 16, 18, 26.8],
  d: [3.2, 28, 16.8, 28], e: [2, 16, 2, 26.8], f: [2, 3.2, 2, 14],
  g: [3.2, 15, 9.2, 15], h: [10.8, 15, 16.8, 15],
  i: [4, 4, 8.5, 12], j: [10, 4, 10, 12], k: [16, 4, 11.5, 12],
  l: [4, 26, 8.5, 18], m: [10, 18, 10, 26], n: [16, 26, 11.5, 18],
};
const letters: Record<string, string> = {
  A: "abcefgh", B: "abcdhjm", C: "adef", D: "abcdjm", E: "adefgh",
  F: "aefgh", G: "acdefh", H: "bcefgh", I: "adjm", J: "bcde",
  K: "efgkn", L: "def", M: "bcefik", N: "bcefin", O: "abcdef",
  P: "abefgh", Q: "abcdefn", R: "abefghn", S: "acdfgh", T: "ajm",
  U: "bcdef", V: "efkl", W: "bcefln", X: "ikln", Y: "ikm", Z: "adkl",
  "0": "abcdefkl", "1": "bc", "2": "abdegh", "3": "abcdgh", "4": "bcfgh",
  "5": "acdfgh", "6": "acdefgh", "7": "abc", "8": "abcdefgh", "9": "abcdfgh",
  "-": "gh", " ": "",
};

function electrode([x1, y1, x2, y2]: [number, number, number, number]) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const dx = (x2 - x1) / length;
  const dy = (y2 - y1) / length;
  const half = 1.5;
  return [
    [x1, y1], [x1 + dx * half - dy * half, y1 + dy * half + dx * half],
    [x2 - dx * half - dy * half, y2 - dy * half + dx * half], [x2, y2],
    [x2 - dx * half + dy * half, y2 - dy * half - dx * half],
    [x1 + dx * half + dy * half, y1 + dy * half - dx * half],
  ].map((point) => point.join(",")).join(" ");
}
const electrodes = Object.fromEntries(Object.entries(strokes).map(([key, points]) => [key, electrode(points)]));

export function LcdSegmentWord({ value }: { value: string }) {
  const chars = [...value.toUpperCase()];
  // Unknown model names retain their full readable label, including Chinese.
  if (chars.some((char) => !(char in letters) && char !== ".")) return <>{value}</>;
  const width = Math.max(1, chars.length * 24 - 4);
  return <svg className="lcd-segment-word" viewBox={`0 0 ${width} 30`} style={{ width: `${width / 30}em` }} aria-hidden="true">
    {chars.map((char, index) => <g key={index} transform={`translate(${index * 24} 0)`}>
      {char === "." ? <circle cx="10" cy="27" r="1.3" /> : [...letters[char]].map((segment) => <polygon key={segment} points={electrodes[segment]} />)}
    </g>)}
  </svg>;
}
