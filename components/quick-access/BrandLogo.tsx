"use client";

import { useState } from "react";

interface BrandLogoProps {
  logoFile?: string;
  logoDir?: string;
  domain?: string;
  label: string;
  fallback: React.ElementType;
  fallbackClassName?: string;
  size?: number;
  rounded?: boolean;
}

export default function BrandLogo({ logoFile, logoDir = "quick-access-logos", domain, label, fallback: Fallback, fallbackClassName = "", size = 22, rounded = false }: BrandLogoProps) {
  const srcs: string[] = [
    ...(logoFile ? [`/${logoDir}/${logoFile}`] : []),
    ...(domain ? [`https://logo.clearbit.com/${domain}?size=${size * 4}`] : []),
  ];

  const [idx, setIdx] = useState(0);

  if (srcs.length === 0 || idx >= srcs.length) {
    return <Fallback className={fallbackClassName} style={{ width: size, height: size }} />;
  }

  return (
    <img
      key={srcs[idx]}
      src={srcs[idx]}
      alt={label}
      width={size}
      height={size}
      className={`object-contain shrink-0 ${rounded ? "rounded-full" : ""}`}
      style={{ width: size, height: size }}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
