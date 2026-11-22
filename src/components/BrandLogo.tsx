import React from 'react';

/**
 * Hand-drawn playing-card emblem featuring "من غير كلام"
 * in horizontally mirrored Arabic brush calligraphy.
 */
export const BrandEmblem: React.FC<{ className?: string }> = ({ className = 'w-12 h-12' }) => (
  <svg viewBox="0 0 512 512" fill="none" className={className} aria-label="من غير كلام">
    <rect width="512" height="512" rx="112" fill="#FBF7F0" />
    <circle cx="256" cy="256" r="228" fill="#F3EBDD" opacity="0.6" />

    <path
      d="M98 106 C100 118 104 122 116 124 C104 126 100 130 98 142 C96 130 92 126 80 124 C92 122 96 118 98 106 Z"
      fill="#8B5E3C"
      opacity="0.85"
    />
    <path
      d="M416 382 C418 392 421 395 431 397 C421 399 418 402 416 412 C414 402 411 399 401 397 C411 395 414 392 416 382 Z"
      fill="#8B5E3C"
      opacity="0.8"
    />
    <path
      d="M416 104 C417.5 111 420 113.5 427 115 C420 116.5 417.5 119 416 126 C414.5 119 412 116.5 405 115 C412 113.5 414.5 111 416 104 Z"
      fill="#231A15"
      opacity="0.5"
    />
    <circle cx="92" cy="382" r="5" fill="#8B5E3C" opacity="0.65" />
    <circle cx="116" cy="408" r="3.5" fill="#231A15" opacity="0.4" />

    <g transform="translate(226 254) rotate(-11)">
      <rect
        x="-126"
        y="-146"
        width="252"
        height="292"
        rx="28"
        fill="#EDE3D2"
        stroke="#231A15"
        strokeWidth="6.5"
        strokeLinejoin="round"
      />
      <path
        d="M-98 -108 C-98 -118 -84 -120 -82 -110 C-80 -102 -90 -98 -90 -91"
        stroke="#8B5E3C"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="-90" cy="-80" r="3.2" fill="#8B5E3C" />
    </g>

    <g transform="translate(272 260) rotate(4.5)">
      <rect
        x="-138"
        y="-148"
        width="276"
        height="304"
        rx="28"
        transform="translate(6 10)"
        fill="#231A15"
        opacity="0.1"
      />
      <rect
        x="-138"
        y="-148"
        width="276"
        height="304"
        rx="28"
        fill="#FFFDF9"
        stroke="#231A15"
        strokeWidth="7.5"
        strokeLinejoin="round"
      />
      <rect
        x="-120"
        y="-130"
        width="240"
        height="268"
        rx="18"
        stroke="#D5C7B2"
        strokeWidth="2.5"
        strokeDasharray="10 7"
      />

      <path
        d="M-101 -102 C-101 -113 -85 -115 -83 -104 C-81 -96 -93 -93 -92 -86"
        stroke="#8B5E3C"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="-92" cy="-75" r="3.4" fill="#8B5E3C" />

      <path
        d="M100 100 C100 111 84 113 82 102 C80 94 92 91 93 84"
        stroke="#8B5E3C"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="93" cy="73" r="3.4" fill="#8B5E3C" />

      <g transform="translate(106 -112) scale(-0.92, 0.92)">
        <g
          stroke="#231A15"
          strokeWidth="14"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M 206 72 C 219 62, 224 80, 210 86 C 199 90, 192 83, 187 74 C 185 96, 173 110, 154 108 C 141 106, 138 92, 143 80" />
          <path d="M 124 67 C 110 60, 97 68, 106 81 C 110 86, 118 88, 122 89 C 107 91, 93 91, 84 90 C 78 90, 74 82, 71 76 C 68 84, 62 90, 52 90 C 46 90, 44 86, 42 82 C 42 98, 32 114, 14 118" />
        </g>
        <g fill="#231A15">
          <circle cx="163" cy="64" r="6.5" />
          <circle cx="111" cy="46" r="6.5" />
          <circle cx="77" cy="110" r="5.8" />
          <circle cx="62" cy="110" r="5.8" />
        </g>

        <g
          stroke="#231A15"
          strokeWidth="14.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M 212 132 L 178 147 L 200 163 C 204 174, 193 182, 178 182 L 156 182" />
          <path d="M 156 124 L 156 172 C 156 186, 134 188, 121 180 C 112 174, 111 163, 117 154" />
          <path d="M 122 124 L 146 181" />
          <path d="M 94 172 C 96 161, 80 158, 76 168 C 73 176, 84 182, 93 179 C 81 180, 75 186, 75 218" />
        </g>
      </g>
    </g>
  </svg>
);

/**
 * Wide Hero Calligraphy Wordmark of "من غير كلام" horizontally mirrored,
 * accented with hand-drawn stars and question marks.
 */
export const BrandWordmark: React.FC<{ className?: string }> = ({
  className = 'w-64 sm:w-72 h-auto',
}) => (
  <svg
    viewBox="0 0 420 140"
    fill="none"
    className={className}
    role="img"
    aria-label="من غير كلام"
  >
    {/* Subtle hand-drawn sparkles & question mark accents */}
    <path
      d="M36 40 C37.5 48 40 50.5 48 52 C40 53.5 37.5 56 36 64 C34.5 56 32 53.5 24 52 C32 50.5 34.5 48 36 40 Z"
      fill="#8B5E3C"
      opacity="0.75"
    />
    <path
      d="M384 78 C385.5 85 388 87.5 395 89 C388 90.5 385.5 93 384 100 C382.5 93 380 90.5 373 89 C380 87.5 382.5 85 384 78 Z"
      fill="#8B5E3C"
      opacity="0.7"
    />
    <path
      d="M366 28 C366 19 380 17 382 27 C384 34 373 37 374 44"
      stroke="#8B5E3C"
      strokeWidth="3.8"
      strokeLinecap="round"
    />
    <circle cx="374" cy="53" r="2.6" fill="#8B5E3C" />
    <circle cx="52" cy="106" r="3" fill="#8B5E3C" opacity="0.55" />

    {/* Horizontally mirrored hand-drawn connected Arabic phrase: من غير كلام */}
    <g transform="translate(362 4) scale(-0.96, 0.96)">
      {/* "من غير" (upper-right in natural RTL -> upper-left when mirrored) */}
      <g
        stroke="#231A15"
        strokeWidth="10.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M 294 42 C 304 34, 308 48, 297 53 C 288 56, 282 50, 278 43 C 276 61, 267 72, 252 70 C 241 68, 239 58, 243 48" />
        <path d="M 227 38 C 216 32, 206 39, 213 49 C 216 53, 223 55, 226 56 C 214 58, 202 58, 195 57 C 190 57, 187 50, 184 45 C 182 51, 177 57, 169 57 C 164 57, 162 54, 160 50 C 160 63, 152 76, 137 80" />
      </g>
      <g fill="#231A15">
        <circle cx="259" cy="34" r="5" />
        <circle cx="217" cy="21" r="5" />
        <circle cx="190" cy="73" r="4.5" />
        <circle cx="177" cy="73" r="4.5" />
      </g>

      {/* "كلام" (natural RTL on left -> sits harmoniously below-right / adjacent when mirrored) */}
      <g
        stroke="#231A15"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d="M 122 36 L 94 49 L 112 62 C 115 71, 106 78, 94 78 L 76 78" />
        <path d="M 76 30 L 76 70 C 76 82, 58 84, 48 77 C 41 72, 40 63, 45 55" />
        <path d="M 49 30 L 68 77" />
        <path d="M 26 70 C 28 60, 14 58, 11 66 C 8 73, 18 78, 25 75 C 15 76, 10 81, 10 108" />
      </g>

      {/* Subtle hand-drawn curved underline flourish */}
      <path
        d="M 22 114 C 95 104, 215 104, 294 112"
        stroke="#8B5E3C"
        strokeWidth="4.2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </g>
  </svg>
);
