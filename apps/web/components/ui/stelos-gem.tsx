// Reusable STELOS gem mark SVG — exact source from STELOS brand kit.
// Pass size (default 28) to scale; aspect ratio is always 160:220 (~0.727).

interface StelosGemProps {
  size?: number;
  className?: string;
}

export function StelosGem({ size = 28, className }: StelosGemProps) {
  const h = Math.round(size * (220 / 160));
  return (
    <svg
      width={size}
      height={h}
      viewBox="-80 -110 160 220"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: "visible", flexShrink: 0 }}
    >
      <defs>
        <radialGradient id="sg_amb" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#6d28d9" stopOpacity="0.38"/>
          <stop offset="60%"  stopColor="#4c1d95" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="#03010a" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="sg_top" cx="42%" cy="0%" r="100%">
          <stop offset="0%"   stopColor="#ffffff"/>
          <stop offset="35%"  stopColor="#ede9fe"/>
          <stop offset="75%"  stopColor="#c4b5fd"/>
          <stop offset="100%" stopColor="#8b5cf6"/>
        </radialGradient>
        <radialGradient id="sg_glint" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="1"/>
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="sg_r1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#8b5cf6" stopOpacity="0"/>
          <stop offset="22%"  stopColor="#8b5cf6" stopOpacity="0.92"/>
          <stop offset="50%"  stopColor="#a78bfa" stopOpacity="1"/>
          <stop offset="78%"  stopColor="#8b5cf6" stopOpacity="0.92"/>
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="sg_r2" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%"   stopColor="#4338ca" stopOpacity="0"/>
          <stop offset="22%"  stopColor="#4338ca" stopOpacity="0.85"/>
          <stop offset="50%"  stopColor="#6366f1" stopOpacity="0.95"/>
          <stop offset="78%"  stopColor="#4338ca" stopOpacity="0.85"/>
          <stop offset="100%" stopColor="#4338ca" stopOpacity="0"/>
        </linearGradient>
        <clipPath id="sg_back"><rect  x="-80" y="-110" width="160" height="110"/></clipPath>
        <clipPath id="sg_front"><rect x="-80" y="0"    width="160" height="110"/></clipPath>
        <filter id="sg_gemGlow"  x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="sg_ringGlow" x="-20%" y="-100%" width="140%" height="300%">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="sg_nodeGlow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Ambient glow */}
      <ellipse cx="0" cy="0" rx="72" ry="72" fill="url(#sg_amb)"/>

      {/* Back ring halves */}
      <g transform="rotate(-20)" filter="url(#sg_ringGlow)">
        <ellipse cx="0" cy="0" rx="76" ry="19" fill="none" stroke="url(#sg_r1)" strokeWidth="3.5" clipPath="url(#sg_back)" opacity="1"/>
      </g>
      <g transform="rotate(16)" filter="url(#sg_ringGlow)">
        <ellipse cx="0" cy="0" rx="64" ry="14" fill="none" stroke="url(#sg_r2)" strokeWidth="2.6" clipPath="url(#sg_back)" opacity="0.88"/>
      </g>

      {/* Gem facets — shadow sides */}
      <polygon points="0,-95 -44,-40 -28,0" fill="#3b0764" opacity="0.9"/>
      <polygon points="0,95  -44,40  -28,0" fill="#2e1065" opacity="0.95"/>
      <polygon points="0,-95  44,-40  28,0" fill="#5b21b6" opacity="0.65"/>
      <polygon points="0,95   44,40   28,0" fill="#4c1d95" opacity="0.85"/>

      {/* Gem facets — lit faces */}
      <g filter="url(#sg_gemGlow)">
        <polygon points="0,-95 75,0 0,-10"  fill="url(#sg_top)" opacity="1"/>
        <polygon points="0,-95 -75,0 0,-10" fill="#c4b5fd"      opacity="0.82"/>
        <polygon points="0,95 75,0 0,10"    fill="#7c3aed"      opacity="0.96"/>
        <polygon points="0,95 -75,0 0,10"   fill="#4c1d95"      opacity="0.94"/>
        <polygon points="0,-10 0,10 -75,0"  fill="#6d28d9"      opacity="0.55"/>
        <polygon points="0,-10 0,10  75,0"  fill="#8b5cf6"      opacity="0.42"/>
      </g>

      {/* Outline + edge highlights */}
      <polygon points="0,-95 75,0 0,95 -75,0" fill="none" stroke="#8b5cf6" strokeWidth="1.1" strokeOpacity="0.7"/>
      <line x1="0" y1="-95" x2="75"  y2="0" stroke="white" strokeWidth="1"   strokeOpacity="0.25"/>
      <line x1="0" y1="-95" x2="-75" y2="0" stroke="white" strokeWidth="0.6" strokeOpacity="0.12"/>

      {/* Crown glint */}
      <ellipse cx="0" cy="-34" rx="16" ry="16" fill="url(#sg_glint)" opacity="0.88"/>
      <circle  cx="0" cy="-34" r="6.5" fill="white" opacity="0.98"/>
      <circle  cx="0" cy="-34" r="2.8" fill="white"/>
      <circle cx="20" cy="-62" r="3.5" fill="white" opacity="0.52"/>
      <circle cx="-8" cy="-74" r="2"   fill="white" opacity="0.28"/>

      {/* Front ring halves */}
      <g transform="rotate(-20)" filter="url(#sg_ringGlow)">
        <ellipse cx="0" cy="0" rx="76" ry="19" fill="none" stroke="url(#sg_r1)" strokeWidth="3.5" clipPath="url(#sg_front)" opacity="1"/>
      </g>
      <g transform="rotate(16)" filter="url(#sg_ringGlow)">
        <ellipse cx="0" cy="0" rx="64" ry="14" fill="none" stroke="url(#sg_r2)" strokeWidth="2.6" clipPath="url(#sg_front)" opacity="0.88"/>
      </g>

      {/* Orbital motion paths */}
      <path id="sg_mp1" d="M 76,0 A 76,19 0 1,1 -76,0 A 76,19 0 1,1 76,0 Z" fill="none" transform="rotate(-20)"/>
      <path id="sg_mp2" d="M 64,0 A 64,14 0 1,1 -64,0 A 64,14 0 1,1 64,0 Z" fill="none" transform="rotate(16)"/>

      {/* Ring 1 nodes */}
      <g transform="rotate(-20)">
        <circle r="5.5" fill="#a78bfa" filter="url(#sg_nodeGlow)">
          <animateMotion dur="4.5s" repeatCount="indefinite" rotate="auto"><mpath href="#sg_mp1"/></animateMotion>
        </circle>
        <circle r="3" fill="#c4b5fd" filter="url(#sg_nodeGlow)" opacity="0.75">
          <animateMotion dur="4.5s" repeatCount="indefinite" begin="-2.25s" rotate="auto"><mpath href="#sg_mp1"/></animateMotion>
        </circle>
      </g>

      {/* Ring 2 nodes */}
      <g transform="rotate(16)">
        <circle r="4.5" fill="#6366f1" filter="url(#sg_nodeGlow)">
          <animateMotion dur="7s" repeatCount="indefinite" begin="-3.5s" rotate="auto"><mpath href="#sg_mp2"/></animateMotion>
        </circle>
        <circle r="2.5" fill="#818cf8" filter="url(#sg_nodeGlow)" opacity="0.7">
          <animateMotion dur="7s" repeatCount="indefinite" begin="-1s" rotate="auto"><mpath href="#sg_mp2"/></animateMotion>
        </circle>
      </g>
    </svg>
  );
}
