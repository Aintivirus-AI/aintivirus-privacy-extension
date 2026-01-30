import React, { useEffect, useRef, useMemo } from 'react';

interface AmbientBackgroundProps {
  /** Active blockchain for color theming */
  chain?: 'solana' | 'ethereum' | 'evm' | 'tron' | 'monero' | string;
  /** Intensity level 0-1 (default 0.3) */
  intensity?: number;
}

// Chain-specific color palettes (very subtle)
const CHAIN_COLORS: Record<string, { primary: string; secondary: string; accent: string }> = {
  solana: {
    primary: 'rgba(153, 69, 255, 0.08)',    // Purple
    secondary: 'rgba(20, 241, 149, 0.05)',   // Teal
    accent: 'rgba(255, 255, 255, 0.03)',
  },
  ethereum: {
    primary: 'rgba(98, 126, 234, 0.08)',     // Blue
    secondary: 'rgba(140, 170, 238, 0.05)',  // Light blue
    accent: 'rgba(255, 255, 255, 0.03)',
  },
  evm: {
    primary: 'rgba(98, 126, 234, 0.08)',
    secondary: 'rgba(140, 170, 238, 0.05)',
    accent: 'rgba(255, 255, 255, 0.03)',
  },
  tron: {
    primary: 'rgba(255, 6, 10, 0.06)',       // Red
    secondary: 'rgba(255, 100, 100, 0.04)',
    accent: 'rgba(255, 255, 255, 0.03)',
  },
  monero: {
    primary: 'rgba(255, 102, 0, 0.07)',      // Orange
    secondary: 'rgba(255, 153, 51, 0.04)',
    accent: 'rgba(255, 255, 255, 0.03)',
  },
  default: {
    primary: 'rgba(91, 95, 199, 0.07)',
    secondary: 'rgba(129, 140, 248, 0.04)',
    accent: 'rgba(255, 255, 255, 0.03)',
  },
};

interface Orb {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  phase: number;
  phaseSpeed: number;
  colorType: 'primary' | 'secondary' | 'accent';
}

const AmbientBackground: React.FC<AmbientBackgroundProps> = ({ 
  chain = 'default',
  intensity = 0.3,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const orbsRef = useRef<Orb[]>([]);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const targetColorsRef = useRef(CHAIN_COLORS.default);
  const currentColorsRef = useRef(CHAIN_COLORS.default);

  const colors = useMemo(() => {
    return CHAIN_COLORS[chain] || CHAIN_COLORS.default;
  }, [chain]);

  useEffect(() => {
    targetColorsRef.current = colors;
  }, [colors]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      ctx.scale(dpr, dpr);
      dimensionsRef.current = { width: rect.width, height: rect.height };
    };

    const createOrb = (): Orb => {
      const { width, height } = dimensionsRef.current;
      const colorTypes: Array<'primary' | 'secondary' | 'accent'> = ['primary', 'secondary', 'accent'];
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 80 + 60, // Large, soft orbs
        vx: (Math.random() - 0.5) * 0.15, // Very slow movement
        vy: (Math.random() - 0.5) * 0.15,
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: Math.random() * 0.005 + 0.002,
        colorType: colorTypes[Math.floor(Math.random() * colorTypes.length)],
      };
    };

    const initOrbs = () => {
      orbsRef.current = [];
      // Just 4-5 large orbs for subtle effect
      for (let i = 0; i < 5; i++) {
        orbsRef.current.push(createOrb());
      }
    };

    const lerpColor = (start: string, end: string, t: number): string => {
      // Extract rgba values
      const parseRgba = (color: string) => {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
        if (match) {
          return {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3]),
            a: parseFloat(match[4] || '1'),
          };
        }
        return { r: 91, g: 95, b: 199, a: 0.07 };
      };

      const startColor = parseRgba(start);
      const endColor = parseRgba(end);

      return `rgba(${
        Math.round(startColor.r + (endColor.r - startColor.r) * t)
      }, ${
        Math.round(startColor.g + (endColor.g - startColor.g) * t)
      }, ${
        Math.round(startColor.b + (endColor.b - startColor.b) * t)
      }, ${
        (startColor.a + (endColor.a - startColor.a) * t).toFixed(3)
      })`;
    };

    const drawOrb = (orb: Orb) => {
      // Smooth color transitions
      const current = currentColorsRef.current;
      const target = targetColorsRef.current;
      
      // Lerp colors
      currentColorsRef.current = {
        primary: lerpColor(current.primary, target.primary, 0.02),
        secondary: lerpColor(current.secondary, target.secondary, 0.02),
        accent: lerpColor(current.accent, target.accent, 0.02),
      };

      const baseColor = currentColorsRef.current[orb.colorType];
      
      // Breathing effect
      orb.phase += orb.phaseSpeed;
      const breathe = Math.sin(orb.phase) * 0.3 + 0.7;
      
      // Create soft radial gradient
      const gradient = ctx.createRadialGradient(
        orb.x, orb.y, 0,
        orb.x, orb.y, orb.radius
      );

      // Parse and adjust alpha based on intensity and breathing
      const adjustedColor = baseColor.replace(
        /[\d.]+\)$/,
        `${parseFloat(baseColor.match(/[\d.]+\)$/)?.[0] || '0.07') * intensity * breathe})`
      );

      gradient.addColorStop(0, adjustedColor);
      gradient.addColorStop(0.5, adjustedColor.replace(/[\d.]+\)$/, '0)'));
      gradient.addColorStop(1, 'transparent');

      ctx.beginPath();
      ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();
    };

    const updateOrb = (orb: Orb) => {
      const { width, height } = dimensionsRef.current;

      // Very slow drift
      orb.x += orb.vx;
      orb.y += orb.vy;

      // Soft boundary bounce
      const margin = orb.radius;
      if (orb.x < -margin) orb.x = width + margin;
      if (orb.x > width + margin) orb.x = -margin;
      if (orb.y < -margin) orb.y = height + margin;
      if (orb.y > height + margin) orb.y = -margin;

      // Very subtle random drift
      orb.vx += (Math.random() - 0.5) * 0.002;
      orb.vy += (Math.random() - 0.5) * 0.002;

      // Limit velocity
      const maxSpeed = 0.2;
      const speed = Math.sqrt(orb.vx * orb.vx + orb.vy * orb.vy);
      if (speed > maxSpeed) {
        orb.vx = (orb.vx / speed) * maxSpeed;
        orb.vy = (orb.vy / speed) * maxSpeed;
      }
    };

    const animate = () => {
      const { width, height } = dimensionsRef.current;
      
      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw orbs
      orbsRef.current.forEach((orb) => {
        updateOrb(orb);
        drawOrb(orb);
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    // Initialize
    resizeCanvas();
    initOrbs();
    animate();

    window.addEventListener('resize', resizeCanvas);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      className="ambient-background-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.8,
      }}
      aria-hidden="true"
    />
  );
};

export default AmbientBackground;
